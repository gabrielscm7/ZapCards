import asyncio

from groq import AsyncGroq

from app.core.config import settings

client = AsyncGroq(api_key=settings.GROQ_API_KEY)

FAST_MODEL = "llama-3.1-8b-instant"
PRO_MODEL = "llama-3.3-70b-versatile"


async def chat_with_context(question: str, context: str) -> str:
    system_prompt = (
        "Voce e um assistente de estudos do ZapCards. "
        "Responda APENAS com base no contexto fornecido abaixo. "
        "Se o contexto for insuficiente, diga exatamente: 'Nao tenho informacao suficiente sobre isso.' "
        "Nunca invente informacao ou use conhecimento externo. "
        "Seja conciso e direto. Responda em portugues."
    )

    response = await client.chat.completions.create(
        model=FAST_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Contexto:\n{context}\n\nPergunta: {question}"},
        ],
        temperature=0.3,
        max_tokens=1024,
    )
    return response.choices[0].message.content or ""


async def generate_flashcards(content: str, difficulty: str, quantity: int) -> list[tuple[str, str]]:
    system_prompt = (
        "Voce e um gerador de flashcards educacionais. "
        f"Gere exatamente {quantity} flashcards com dificuldade '{difficulty}'. "
        "Cada flashcard deve ter uma pergunta e uma resposta baseadas exclusivamente no conteudo fornecido. "
        "Retorne APENAS um array JSON com objetos {question, answer}. "
        "Nada mais. Sem explicacoes. Apenas o JSON."
    )

    response = await client.chat.completions.create(
        model=PRO_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Conteudo:\n{content}"},
        ],
        temperature=0.7,
        max_tokens=2048,
        response_format={"type": "json_object"},
    )

    import json
    text = response.choices[0].message.content or "[]"
    try:
        data = json.loads(text)
        if isinstance(data, dict):
            items = data.get("flashcards", data.get("cards", []))
        else:
            items = data
        return [(item["question"], item["answer"]) for item in items[:quantity]]
    except (json.JSONDecodeError, KeyError):
        return []


async def evaluate_answer(user_answer: str, correct_answer: str) -> tuple[bool, str]:
    system_prompt = (
        "Compare a resposta do usuario com o gabarito. "
        "Responda com JSON: {correct: bool, feedback: string}. "
        "Seja tolerante com equivalentes semanticos e pequenos erros de digitacao. "
        "O feedback deve ser curto (1-2 frases) e em portugues."
    )

    response = await client.chat.completions.create(
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
    text = response.choices[0].message.content or "{}"
    try:
        data = json.loads(text)
        return data.get("correct", False), data.get("feedback", "")
    except json.JSONDecodeError:
        return False, ""


async def transcribe_audio(audio_url: str) -> str:
    response = await client.audio.transcriptions.create(
        model="whisper-large-v3-turbo",
        file=(audio_url,),
        response_format="text",
    )
    return response if isinstance(response, str) else ""
