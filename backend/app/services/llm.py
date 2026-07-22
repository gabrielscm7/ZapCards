import asyncio
import logging

from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

from app.core.config import settings

logger = logging.getLogger(__name__)

_client = None
RETRYABLE_ERRORS = (Exception,)


def _get_client():
    global _client
    if _client is None:
        from groq import AsyncGroq
        _client = AsyncGroq(api_key=settings.GROQ_API_KEY)
    return _client


FAST_MODEL = "llama-3.1-8b-instant"
PRO_MODEL = "llama-3.3-70b-versatile"

_retry_decorator = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    retry=retry_if_exception_type(RETRYABLE_ERRORS),
    reraise=True,
    before_sleep=lambda retry_state: logger.warning(
        "Groq API retry %d/%d after %s",
        retry_state.attempt_number,
        3,
        retry_state.outcome.exception() if retry_state.outcome else "unknown",
    ),
)


@_retry_decorator
async def _groq_chat(model: str, messages: list, temperature: float, max_tokens: int, response_format: dict | None = None):
    kwargs = dict(model=model, messages=messages, temperature=temperature, max_tokens=max_tokens)
    if response_format:
        kwargs["response_format"] = response_format
    response = await _get_client().chat.completions.create(**kwargs)
    return response.choices[0].message.content or ""


@_retry_decorator
async def _groq_audio(file_tuple: tuple, model: str):
    response = await _get_client().audio.transcriptions.create(
        model=model,
        file=file_tuple,
        response_format="text",
    )
    return response


async def chat_with_context(question: str, context: str) -> str:
    system_prompt = (
        "Voce e um assistente de estudos do ZapCards. "
        "Responda APENAS com base no contexto fornecido abaixo. "
        "Se o contexto for insuficiente, diga exatamente: 'Nao tenho informacao suficiente sobre isso.' "
        "Nunca invente informacao ou use conhecimento externo. "
        "Seja conciso e direto. Responda em portugues."
    )

    return await _groq_chat(
        model=FAST_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Contexto:\n{context}\n\nPergunta: {question}"},
        ],
        temperature=0.3,
        max_tokens=1024,
    )


async def generate_flashcards(content: str, difficulty: str, quantity: int) -> list[dict]:
    system_prompt = (
        "Voce e um gerador de flashcards educacionais diversificados. "
        f"Gere exatamente {quantity} flashcards com dificuldade '{difficulty}'. "
        "Voce DEVE variar entre os tipos disponiveis conforme o conteudo pede. "
        "Cada flashcard tem um 'card_type' e campos especificos conforme abaixo:\n\n"
        "Tipos disponiveis:\n"
        "- basico: pergunta e resposta simples. Campos: {card_type, question, answer, difficulty}\n"
        "- cloze: texto com uma lacuna marcada como [ ... ]. Campos: {card_type, cloze_text, answer, difficulty}\n"
        "- multipla_escolha: pergunta com opcoes e indice da correta. Campos: {card_type, question, options[], correct_index, answer, difficulty}\n"
        "- verdadeiro_falso: afirmacao para julgar. Campos: {card_type, statement, is_true, answer, difficulty}\n"
        "- sequencia: passos em ordem correta. Campos: {card_type, question, steps[], answer, difficulty}\n"
        "- cenario: situacao pratica com pergunta. Campos: {card_type, scenario, question, answer, difficulty}\n\n"
        "Escolha o tipo MAIS ADEQUADO para cada trecho do conteudo:\n"
        "- Use 'cloze' para definicoes com termo chave (ex: 'A [ ... ] e a unidade basica da vida')\n"
        "- Use 'multipla_escolha' para conceitos com alternativas naturais\n"
        "- Use 'verdadeiro_falso' para fatos que podem ser afirmados ou negados\n"
        "- Use 'sequencia' para processos com etapas ordenadas\n"
        "- Use 'cenario' para casos praticos ou aplicacoes\n"
        "- Use 'basico' como fallback quando nenhum outro encaixar bem\n\n"
        "Retorne APENAS um array JSON no formato:\n"
        '{"flashcards": [{card_type, question|cloze_text|statement|scenario, answer, options[], correct_index, steps[], is_true, difficulty}]}\n'
        "Nada mais. Sem explicacoes."
    )

    text = await _groq_chat(
        model=PRO_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Conteudo:\n{content}"},
        ],
        temperature=0.7,
        max_tokens=3072,
        response_format={"type": "json_object"},
    )

    import json
    try:
        data = json.loads(text)
        items = data.get("flashcards", data.get("cards", []))
        return items[:quantity]
    except (json.JSONDecodeError, KeyError):
        return []


async def evaluate_answer(user_answer: str, correct_answer: str, card_type: str = "basico") -> tuple[bool, str]:
    if card_type in ("multipla_escolha", "cloze"):
        is_correct = user_answer.strip().lower() == correct_answer.strip().lower()
        feedback = "Correto!" if is_correct else f"Incorreto. A resposta correta e: {correct_answer}"
        return is_correct, feedback

    if card_type == "verdadeiro_falso":
        user_norm = user_answer.strip().lower()
        correct_norm = correct_answer.strip().lower()
        true_answers = ("true", "verdadeiro", "v", "sim", "s", "yes", "y")
        false_answers = ("false", "falso", "f", "nao", "não", "no", "n")
        user_bool = user_norm in true_answers if True else user_norm in false_answers
        correct_bool = correct_norm in true_answers
        is_correct = user_bool == correct_bool
        feedback = "Correto!" if is_correct else f"Incorreto. A resposta correta e: {correct_answer}"
        return is_correct, feedback

    system_prompt = (
        "Compare a resposta do usuario com o gabarito. "
        "Responda com JSON: {correct: bool, feedback: string}. "
        "Seja tolerante com equivalentes semanticos e pequenos erros de digitacao. "
        "O feedback deve ser curto (1-2 frases) e em portugues."
    )

    text = await _groq_chat(
        model=FAST_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Gabarito: {correct_answer}\nResposta do usuario: {user_answer}"},
        ],
        temperature=0.1,
        max_tokens=256,
        response_format={"type": "json_object"},
    )

    import json
    try:
        data = json.loads(text)
        return data.get("correct", False), data.get("feedback", "")
    except json.JSONDecodeError:
        return False, ""


async def transcribe_audio_file(file_name: str, file_data: bytes) -> str:
    response = await _groq_audio(
        file_tuple=(file_name, file_data),
        model="whisper-large-v3-turbo",
    )
    return response if isinstance(response, str) else ""


async def transcribe_audio(audio_url: str) -> str:
    response = await _groq_audio(
        file_tuple=(audio_url,),
        model="whisper-large-v3-turbo",
    )
    return response if isinstance(response, str) else ""
