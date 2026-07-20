# SPEC — ZapCards
**Especificacao Tecnica**

> Este documento registra decisoes arquiteturais tecnicas. As alteracoes devem ser documentadas no changelog.

---

## 0. Metadados e changelog

| Campo | Valor |
|---|---|
| Versao atual | 1.2.0 |
| Ultima atualizacao | 2026-07-20 |
| Status | Implementacao ativa — backend + frontend funcionais |

| Versao | Data | Alteracao | Motivo |
|---|---|---|---|
| 1.0.0 | 2026-07-19 | Criacao do documento | Esboco inicial |
| 1.1.0 | 2026-07-19 | Servicos separados + Railway Buckets + Arq | Deploy independente |
| 1.2.0 | 2026-07-20 | Auth JWT, shadcn/ui, dark/light theme, dashboard com charts, import pipeline conectado, WhatsApp loop interativo, dev storage local, testes | Feature completion + UX overhaul |

---

## 1. Principio arquitetural

O nucleo de notas em Markdown e a fonte unica da verdade. Todos os modulos leem e escrevem nesse nucleo. Toda resposta IA e restrita ao conteudo indexado (RAG fechado).

## 2. Componentes e onde rodam

| Componente | Responsabilidade | Hospedagem |
|---|---|---|
| Frontend web (Next.js) | Editor Markdown, visualizacao de grafo, chatbox, dashboard | Railway |
| API principal (FastAPI) | Regras de negocio, autenticacao, orquestracao | Railway |
| PostgreSQL + pgvector | Notas, tags, links, historico de flashcards, embeddings | Railway |
| Redis + workers (Arq) | Filas de OCR, conversao, transcricao | Railway |
| Modelo de embeddings (local) | Vetorizacao para RAG | Railway (CPU) |
| Armazenamento de arquivos | Guarda do arquivo bruto | Railway Buckets / S3 / Local |
| Inferencia de LLM | Flashcards, testes, respostas do chatbox | Groq API |
| Bot de WhatsApp | Interface de conversa interativa | Baileys (MVP) |

## 3. Modelo de dados

```
notes
  id            uuid pk
  title         text
  content_md    text
  area          text
  source_type   enum(text, ocr, pdf, docx, csv, audio, video)
  source_file   text
  created_at    timestamp
  updated_at    timestamp

tags
  id            uuid pk
  name          text unique

note_tags        (many-to-many)
note_links       (directed graph edges)
note_chunks      (pgvector embeddings, 1024-dim, IVFFlat index)

flashcards
  id            uuid pk
  note_id       fk -> notes.id
  question      text
  answer        text
  difficulty    enum(facil, medio, dificil)

review_history
  id            uuid pk
  flashcard_id  fk -> flashcards.id
  user_id       fk -> users.id
  rating        enum(errei, dificil, bom, facil)
  stability     float
  difficulty    float
  next_review   timestamp

users
  id            uuid pk
  name          text
  email         text unique (nullable)
  whatsapp_id   text unique (nullable)
  password_hash text (nullable)
  created_at    timestamp
```

## 4. Pipeline de ingestao

1. Upload do arquivo → salvo no storage (S3 ou local dev)
2. Job assincrono (Arq/Redis) identifica tipo e roteia:
   - Imagem → OCR (Tesseract) → Markdown
   - PDF/DOC/DOCX/CSV → markitdown → Markdown
   - Audio/Video → Groq Whisper → Markdown
3. Markdown salvo como nota (`notes.content_md`)
4. Nota chunked → embeddings gerados → salvos em `note_chunks`

## 5. Pipeline de RAG

1. Query vetorizada pelo modelo de embeddings (BAAI/bge-m3)
2. Busca por similaridade cosseno em `note_chunks` via pgvector
3. Filtro de confianca (threshold default 0.75) — sem LLM se abaixo
4. Chunks + system prompt restritivo enviados ao Groq
5. Resposta retornada com fontes dos chunks recuperados

## 6. Autenticacao

- JWT (HS256) com python-jose + passlib (bcrypt)
- Endpoints: POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
- Middleware opcional — endpoints funcionam sem auth, com suporte a bearer token
- User model com email e password_hash para auth

## 7. Frontend

- Next.js 15 + React 19 + Tailwind CSS 4
- shadcn/ui components (Button, Card, Input, Select, Tabs, Tooltip, Dialog, Badge, etc.)
- Dark/Light theme toggle (next-themes)
- Dashboard com graficos interativos (recharts: Pie, Bar)
- Sidebar navigation com icones lucide-react
- Toast notifications (sonner)

## 8. Motor de repeticao espacada (FSRS)

- Biblioteca: py-fsrs
- Cada review atualiza stability, difficulty, next_review
- Cards a revisar = `WHERE next_review <= now()`

## 9. Bot de WhatsApp

- Baileys (WhatsApp Web API)
- Sessao de estudo interativa com loop de Q&A
- Avaliacao semantica de respostas via LLM
- Comandos: "treinar"/"flashcard" inicia, "pular" avanca, "sair" encerra

## 10. Contratos de API

| Metodo | Path | Descricao |
|---|---|---|
| POST | /api/auth/register | Registro de usuario |
| POST | /api/auth/login | Login |
| GET | /api/auth/me | Usuario atual |
| POST | /api/notes | Criar nota |
| GET | /api/notes | Listar notas |
| GET | /api/notes/{id} | Obter nota |
| PATCH | /api/notes/{id} | Atualizar nota |
| DELETE | /api/notes/{id} | Deletar nota |
| POST | /api/notes/import | Upload de arquivo |
| GET | /api/notes/graph/data | Dados do grafo |
| POST | /api/notes/{id}/link/{target} | Linkar notas |
| DELETE | /api/notes/{id}/link/{target} | Deslinkar |
| GET | /api/notes/tags | Listar tags |
| POST | /api/flashcards/generate | Gerar flashcards |
| GET | /api/flashcards | Listar flashcards |
| GET | /api/flashcards/due | Cards para revisao |
| POST | /api/flashcards/review | Submeter revisao |
| DELETE | /api/flashcards/{id} | Deletar flashcard |
| POST | /api/chat | Chat RAG |
| GET | /api/health | Health check |
| GET | /api/settings | Configuracoes do sistema |

## 11. Variaveis de ambiente

- DATABASE_URL, REDIS_URL
- GROQ_API_KEY
- S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_REGION
- SECRET_KEY, CORS_ORIGINS, ENVIRONMENT
- SIMILARITY_THRESHOLD, EMBEDDING_MODEL, CHUNK_SIZE, CHUNK_OVERLAP
- DEV_USE_LOCAL_STORAGE, LOCAL_STORAGE_PATH
- BACKEND_URL, FRONTEND_URL

## 12. Testes

- Backend: pytest + pytest-asyncio + httpx (AsyncClient)
- Testes de API: health, CRUD de notas, tags, grafo, chat, auth
- Frontend: Next.js build com checagem de tipos
- Executar: `cd backend && pytest tests/ -v`
