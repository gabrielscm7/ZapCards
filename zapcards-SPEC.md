# SPEC — ZapCards
**Especificacao Tecnica**

> Este documento registra decisoes arquiteturais tecnicas. As alteracoes devem ser documentadas no changelog.

---

## 0. Metadados e changelog

| Campo | Valor |
|---|---|
| Versao atual | 1.3.0 |
| Ultima atualizacao | 2026-07-22 |
| Status | Implementacao ativa — backend + frontend funcionais |

| Versao | Data | Alteracao | Motivo |
|---|---|---|---|
| 1.0.0 | 2026-07-19 | Criacao do documento | Esboco inicial |
| 1.1.0 | 2026-07-19 | Servicos separados + Railway Buckets + Arq | Deploy independente |
| 1.2.0 | 2026-07-20 | Auth JWT, shadcn/ui, dark/light theme, dashboard com charts, import pipeline conectado, WhatsApp loop interativo, dev storage local, testes | Feature completion + UX overhaul |
| 1.3.0 | 2026-07-22 | user_id FK em notes, auth obrigatoria, HNSW index, chunking por headers Markdown, note_status, retry Groq, Redis sessions no bot, card_type diversificado | Seguranca, qualidade RAG, resiliencia, flashcards diversificados |

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
  user_id       fk -> users.id (NOT NULL)
  title         text
  content_md    text
  area          text
  source_type   enum(text, ocr, pdf, docx, csv, audio, video)
  source_file   text
  status        enum(processing, ready, failed) default ready
  created_at    timestamp
  updated_at    timestamp

tags
  id            uuid pk
  name          text unique

note_tags        (many-to-many)
note_links       (directed graph edges)
note_chunks      (pgvector embeddings, 1024-dim, HNSW index m=16 ef_construction=64)

flashcards
  id            uuid pk
  note_id       fk -> notes.id
  question      text
  answer        text
  difficulty    enum(facil, medio, dificil)
  card_type     enum(basico, cloze, multipla_escolha, verdadeiro_falso, sequencia, cenario)
  metadata_json text (nullable — armazena options[], steps[], correct_index, etc.)

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
2. Note criada com `status = 'processing'` e `user_id` do usuario autenticado
3. Job assincrono (Arq/Redis) identifica tipo e roteia:
   - Imagem → OCR (Tesseract) → Markdown
   - PDF/DOC/DOCX/CSV → markitdown → Markdown
   - Audio/Video → Groq Whisper (com retry 3x) → Markdown
4. Markdown salvo como nota (`notes.content_md`)
5. Nota chunked por estrutura Markdown (headers # e ##) + fallback por CHUNK_SIZE
6. Embeddings gerados → salvos em `note_chunks`
7. Se sucesso: `status = 'ready'`. Se erro: `status = 'failed'`

## 5. Pipeline de RAG

1. Query vetorizada pelo modelo de embeddings (BAAI/bge-m3)
2. Busca por similaridade cosseno em `note_chunks` via pgvector (HNSW index, m=16, ef_construction=64)
3. Filtro de confianca (threshold default 0.70) — sem LLM se abaixo
4. Chunks + system prompt restritivo enviados ao Groq (com retry 3x via tenacity)
5. Resposta retornada com fontes dos chunks recuperados, filtradas por user_id

## 6. Autenticacao

- JWT (HS256) com python-jose + passlib (bcrypt)
- Endpoints: POST /api/auth/register, POST /api/auth/login, GET /api/auth/me
- SEGURANCA: JWT obrigatorio em /api/notes/*, /api/flashcards/*, /api/chat, /api/notes/import
- APENAS /api/health e /api/auth/* permanecem sem autenticacao
- Todo conteudo isolado por user_id: notes, flashcards, note_chunks, chat RAG

## 7. Frontend

- Next.js 15 + React 19 + Tailwind CSS 4
- shadcn/ui components (Button, Card, Input, Select, Tabs, Tooltip, Dialog, Badge, etc.)
- Dark/Light theme toggle (next-themes)
- Dashboard com graficos interativos (recharts: Pie, Bar)
- Sidebar navigation com icones lucide-react
- Toast notifications (sonner)
- Flashcard page com suporte a 6 card_types: basico, cloze, multipla_escolha, verdadeiro_falso, sequencia, cenario
- Indicador de note_status (processing/ready/failed) na biblioteca e import

## 8. Motor de repeticao espacada (FSRS)

- Biblioteca: py-fsrs
- Cada review atualiza stability, difficulty, next_review
- Cards a revisar = `WHERE next_review <= now()`

## 9. Bot de WhatsApp

- Baileys (WhatsApp Web API)
- Sessoes de estudo armazenadas no Redis com TTL de 30 min
- HTTP client tipado com retry (3 tentativas) e timeout (15s)
- Avaliacao de respostas ramificada por card_type (sem LLM para multipla_escolha/cloze/verdadeiro_falso)
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
