# SPEC — ZapCards
**Especificação Técnica**

> Este é um documento vivo. Toda alteração relevante de arquitetura, stack ou contrato de dados deve ser registrada no changelog (seção 0) e refletida na seção correspondente. Não editar decisões antigas silenciosamente — registrar a mudança e o motivo.

---

## 0. Metadados e changelog

| Campo | Valor |
|---|---|
| Versão atual | 1.0.0 |
| Última atualização | 2026-07-19 |
| Status | Draft — pré-implementação |

| Versão | Data | Alteração | Motivo |
|---|---|---|---|
| 1.0.0 | 2026-07-19 | Criação do documento | Esboço inicial completo, cobrindo os 4 módulos |
| 1.1.0 | 2026-07-19 | Serviços separados (sem monorepo) + Railway Buckets + Arq | Separação de serviços para deploy independente; Buckets Railway no lugar de Cloudflare R2; Arq no lugar de Celery |

---

## 1. Princípio arquitetural

O núcleo de notas em Markdown é a fonte única da verdade. Todos os módulos (grafo, geração de flashcards, chatbox, bot de WhatsApp) leem e escrevem nesse núcleo; nenhum mantém lógica de conteúdo própria fora dele. Toda resposta gerada por IA é restrita ao conteúdo indexado do usuário (RAG fechado, sem busca externa).

## 2. Componentes e onde rodam

| Componente | Responsabilidade | Hospedagem |
|---|---|---|
| Frontend web (Next.js) | Editor Markdown, visualização de grafo, chatbox | Railway |
| API principal (FastAPI) | Regras de negócio, autenticação, orquestração | Railway |
| PostgreSQL + pgvector | Notas, tags, links, histórico de flashcards, embeddings | Railway |
| Redis + workers (Celery/Arq) | Filas de OCR, conversão de arquivo, transcrição | Railway |
| Modelo de embeddings (local) | Vetorização de notas e queries para RAG | Railway (CPU) |
| OCR (Tesseract / TrOCR) | Extração de texto de imagens | Railway (CPU) |
| Armazenamento de arquivos originais | Guarda do arquivo bruto importado | Cloudflare R2 (S3-compatível) |
| Inferência de LLM (geração de texto) | Flashcards, testes, respostas do chatbox, NLU do bot | Groq API (externo) |
| Transcrição de áudio/vídeo (opcional) | Alternativa ao Whisper self-hosted | Groq API (Whisper Turbo) |
| Bot de WhatsApp | Interface de conversa | WhatsApp Business Cloud API (produção) / Baileys (MVP) |

## 3. Modelo de dados (visão inicial)

```
notes
  id            uuid pk
  title         text
  content_md    text
  area          text
  source_type   enum(text, ocr, pdf, docx, csv, audio, video)
  source_file   text (referência ao objeto no storage, se houver)
  created_at    timestamp
  updated_at    timestamp

tags
  id            uuid pk
  name          text unique

note_tags
  note_id       fk -> notes.id
  tag_id        fk -> tags.id

note_links
  from_note_id  fk -> notes.id
  to_note_id    fk -> notes.id

note_chunks
  id            uuid pk
  note_id       fk -> notes.id
  content       text
  embedding     vector(dim)   -- pgvector

flashcards
  id            uuid pk
  note_id       fk -> notes.id
  question      text
  answer        text
  difficulty    enum(facil, medio, dificil)
  created_at    timestamp

review_history
  id            uuid pk
  flashcard_id  fk -> flashcards.id
  user_id       fk -> users.id
  reviewed_at   timestamp
  rating        enum(errei, dificil, bom, facil)
  stability     float   -- FSRS
  difficulty    float   -- FSRS
  next_review   timestamp

users
  id            uuid pk
  name          text
  whatsapp_id   text
  created_at    timestamp
```

Esta seção deve ser expandida com constraints, índices e migrations reais assim que a Fase 1 começar.

## 4. Pipeline de ingestão

1. Upload do arquivo (qualquer formato suportado) → salvo no storage de objetos (R2).
2. Job assíncrono (fila Redis) identifica o tipo e roteia:
   - Imagem → OCR (TrOCR se manuscrito, Tesseract se impresso) → Markdown.
   - PDF/DOC/CSV → `markitdown` (fallback `pandoc`) → Markdown.
   - Áudio/vídeo → transcrição (Groq Whisper Turbo ou Whisper self-hosted) → Markdown.
3. Markdown resultante é salvo como nova nota (`notes.content_md`), com `source_type` e `source_file` preenchidos.
4. Nota é dividida em chunks (~300-500 tokens) → cada chunk vetorizado pelo modelo de embeddings local → salvo em `note_chunks`.
5. Usuário revisa/ajusta tags e links manualmente ou aceita sugestões automáticas (extração de entidades/termos-chave via LLM, opcional na v1).

## 5. Pipeline de RAG

1. Pergunta do usuário (chatbox ou WhatsApp) é vetorizada pelo mesmo modelo de embeddings.
2. Busca por similaridade em `note_chunks` via pgvector (`ORDER BY embedding <-> query_embedding LIMIT k`).
3. **Filtro de confiança**: se o melhor score de similaridade estiver abaixo do limiar configurado (valor inicial sugerido: 0.75, a calibrar), a resposta é a mensagem fixa de fallback — **sem** chamar o LLM.
4. Chunks recuperados + system prompt restritivo ("responda apenas com base no contexto abaixo; se insuficiente, diga que não sabe") são enviados ao Groq.
5. Resposta é retornada ao usuário, citando a nota de origem quando pertinente.

## 6. Geração de flashcards/testes

- Entrada: uma ou mais `note_id` selecionadas + parâmetro de dificuldade + quantidade.
- Prompt monta o conteúdo Markdown das notas selecionadas como contexto e instrui o modelo (Groq, modelo 70B para qualidade) a gerar N pares pergunta/resposta ou questões de múltipla escolha com gabarito e justificativa.
- Cada flashcard gerado é persistido com `note_id` de origem (necessário para o resumo de reforço em caso de erro).

## 7. Motor de repetição espaçada (FSRS)

- Biblioteca: `py-fsrs` (ou implementação equivalente).
- Cada `review_history` atualiza `stability`, `difficulty` e calcula `next_review` com base na avaliação do usuário (errei/difícil/bom/fácil).
- Consulta de "cards a revisar hoje" = `WHERE next_review <= now()`, usada tanto pelo chatbox quanto pelo bot de WhatsApp.
- Exportação opcional para `.apkg` via `genanki`, sob demanda do usuário — não faz parte do fluxo principal.

## 8. Fluxo do bot de WhatsApp

```
Usuário → "Quero treinar, crie 10 flashcards difíceis sobre X"
  → NLU (Groq) extrai: assunto=X, quantidade=10, dificuldade=dificil
  → Busca notas relacionadas a X (tag + embedding)
  → Gera ou reaproveita flashcards existentes
  → Envia flashcard 1/10
Usuário → responde
  → avaliação semântica da resposta (comparação com gabarito via LLM, não string exata)
  → se errado: envia resumo curto da nota de origem
  → registra review_history (atualiza FSRS)
  → envia próximo flashcard
  → repete até completar a sessão
```

## 9. Contratos de API (a detalhar por endpoint)

Placeholder para a próxima revisão deste documento — cada endpoint deve documentar: método, path, payload de entrada, resposta, códigos de erro.

- `POST /notes` — cria nota
- `POST /notes/import` — upload de arquivo para ingestão assíncrona
- `GET /graph` — retorna nodes e edges para visualização
- `POST /flashcards/generate` — gera flashcards a partir de notas selecionadas
- `POST /chat` — mensagem para o chatbox interno
- `POST /webhook/whatsapp` — recebe eventos da API do WhatsApp

## 10. Variáveis de ambiente / segredos (a definir na Fase 1)

- `DATABASE_URL`
- `REDIS_URL`
- `GROQ_API_KEY`
- `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_ID`
- `S3_ENDPOINT` / `S3_BUCKET` / `S3_ACCESS_KEY` / `S3_SECRET_KEY`
- `SIMILARITY_THRESHOLD` (parametrizável, não hardcoded)

## 11. Pontos em aberto (a resolver em versões futuras deste SPEC)

- Dimensão exata do vetor de embeddings (depende do modelo escolhido — definir na Fase 1).
- Estratégia de chunking definitiva (tamanho fixo vs. por seção Markdown).
- Definição do modelo de embeddings final (bge-m3 vs. multilingual-e5 vs. outro).
- Decisão definitiva WhatsApp: Cloud API oficial desde o início vs. Baileys no MVP com migração planejada.
- Esquema de autenticação de usuários (a especificar).
