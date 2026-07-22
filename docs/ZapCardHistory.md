# ZapCards — Histórico de Desenvolvimento

**Autor**: Gabriel Menezes  
**Data do documento**: 22 de julho de 2026  
**Versão atual do sistema**: 1.2.0  
**Último commit**: `649fb86` (auditoria arquitetural)

---

## 1. Estado Atual do Desenvolvimento

### 1.1 Visão Geral

ZapCards é uma plataforma pessoal de estudos que unifica **captura de conteúdo** (notas, PDFs, imagens, áudio), **organização do conhecimento** (tags, grafo, busca semântica) e **revisão** (flashcards, repetição espaçada FSRS, chat RAG), com um bot de WhatsApp que permite estudar por conversa.

O sistema está **funcional e implantado** no Railway com 6 serviços. Todas as 6 fases de entrega do PRD foram concluídas:

| Fase | Descrição | Status |
|---|---|---|
| 1 | Núcleo de notas (Markdown + tags + CRUD) | Concluído |
| 2 | Grafo de conhecimento | Concluído |
| 3 | Ingestão multi-formato (OCR, PDF, áudio) | Concluído |
| 4 | Flashcards + FSRS repetição espaçada | Concluído |
| 5 | Chatbox interno com RAG | Concluído |
| 6 | Bot de WhatsApp | Concluído |

### 1.2 Serviços em Produção (Railway)

| Serviço | Tecnologia | Porta | Função |
|---|---|---|---|
| **Frontend** | Next.js 15 + React 19 + Tailwind 4 | 3000 | Dashboard, editor, chat, grafo, flashcards |
| **Backend API** | FastAPI (Python 3.12) + Uvicorn | 8000 | REST API, autenticação JWT, lógica de negócio |
| **Workers** | Arq + Redis | — | OCR, conversão PDF, transcrição áudio, embeddings |
| **WhatsApp Bot** | Node.js + Baileys 6.7.8 | 3000 | Sessão de estudo interativa via WhatsApp |
| **PostgreSQL** | pgvector + pgcrypto | 5432 | Dados, vetores (1024-dim), índices IVFFlat |
| **Redis** | Redis 7 | 6379 | Fila de jobs Arq |

### 1.3 Páginas do Frontend

| Rota | Página | Funcionalidade |
|---|---|---|
| `/` | Dashboard | Cards de estatísticas, gráficos pizza/barras (recharts) |
| `/biblioteca` | Biblioteca | CRUD completo de notas com editor Markdown |
| `/notes` | Nova Nota | Criação de notas com tags e área |
| `/chat` | Chat IA | Chat RAG — responde apenas com conteúdo próprio |
| `/flashcards` | Flashcards | Geração por IA, listagem, revisão FSRS, exportação Anki |
| `/graph` | Grafo | Visualização interativa do grafo de conhecimento (force-graph-2d) |
| `/import` | Importar | Upload multi-formato com pipeline de processamento |

---

## 2. Arquitetura e SPEC (v1.2.0)

### 2.1 Princípio Arquitetural

> O núcleo de notas em **Markdown** é a fonte única da verdade. Todos os módulos leem e escrevem nesse núcleo. Toda resposta de IA é restrita ao conteúdo indexado — **RAG fechado**, sem alucinação com conhecimento externo.

### 2.2 Modelo de Dados e Relacionamentos

```
┌─────────────────────────────────────────────────────────────────┐
│                         DATA MODEL                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐       ┌──────────────┐       ┌──────────┐        │
│  │   users  │       │    notes     │       │   tags   │        │
│  ├──────────┤       ├──────────────┤       ├──────────┤        │
│  │ id (PK)  │       │ id (PK)      │       │ id (PK)  │        │
│  │ name     │       │ title        │       │ name (UQ)│        │
│  │ email    │       │ content_md   │       └────┬─────┘        │
│  │ w.app_id │       │ area         │            │              │
│  │ pass_hash│       │ source_type  │    note_tags (M2M)        │
│  │ created  │       │ source_file  │◄──────────────────────────│
│  └────┬─────┘       │ created_at   │                            │
│       │             │ updated_at   │                            │
│       │             └──┬──┬───┬───┘                            │
│       │                │  │   │                                │
│       │      ┌─────────┘  │   └──────────┐                     │
│       │      │            │              │                     │
│       │  note_links    note_chunks   flashcards                │
│       │  (directed)    (pgvector)    ┌──────────┐              │
│       │  ┌──────────┐  ┌──────────┐  │ id (PK)  │              │
│       │  │from (FK) │  │ id (PK)  │  │ note(FK) │              │
│       │  │ to (FK)  │  │ note(FK) │  │ question │              │
│       │  └──────────┘  │ content  │  │ answer   │              │
│       │                │ embedding│  │ diff     │              │
│       │                │ (1024d)  │  │ created  │              │
│       │                │ IVFFlat  │  └────┬─────┘              │
│       │                └──────────┘       │                    │
│       │                                   │                    │
│       │            ┌──────────────────────┘                    │
│       │            │                                           │
│       │       review_history (FSRS)                            │
│       │       ┌──────────────────┐                             │
│       └──────►│ user_id (FK)     │                             │
│               │ flashcard_id(FK) │                             │
│               │ rating (enum)    │                             │
│               │ stability(float) │                             │
│               │ difficulty(float)│                             │
│               │ next_review(ts)  │                             │
│               │ reviewed_at(ts)  │                             │
│               └──────────────────┘                             │
│                                                                 │
│  Relacionamentos:                                               │
│  • Note ←→ Tag (M2M via note_tags)                             │
│  • Note → Note (grafo direcionado via note_links)               │
│  • Note → NoteChunk (1:N, chunks com embeddings)                │
│  • Note → Flashcard (1:N)                                      │
│  • Flashcard → ReviewHistory (1:N)                             │
│  • User → ReviewHistory (1:N)                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Tipos enumerados:**
- `note_source_type`: text, ocr, pdf, docx, csv, audio, video
- `flashcard_difficulty`: facil, medio, dificil
- `review_rating`: errei, dificil, bom, facil

### 2.3 Contratos de API (18 Endpoints)

#### Autenticação
| Método | Path | Descrição | Autenticação |
|---|---|---|---|
| POST | `/api/auth/register` | Registro (name, email/whatsapp, password) | Não |
| POST | `/api/auth/login` | Login (email/whatsapp + password) | Não |
| GET | `/api/auth/me` | Usuário atual | Bearer JWT |

#### Notas
| Método | Path | Descrição | Autenticação |
|---|---|---|---|
| POST | `/api/notes` | Criar nota | Opcional |
| GET | `/api/notes` | Listar notas (filtros: area, tag, search) | Opcional |
| GET | `/api/notes/{id}` | Obter nota | Opcional |
| PATCH | `/api/notes/{id}` | Atualizar nota | Opcional |
| DELETE | `/api/notes/{id}` | Deletar nota | Opcional |
| POST | `/api/notes/import` | Upload arquivo (multipart) | Opcional |
| GET | `/api/notes/tags` | Listar todas as tags | Opcional |
| GET | `/api/notes/graph/data` | Dados do grafo (filtros: tag, area) | Opcional |
| POST | `/api/notes/{id}/link/{target}` | Criar link entre notas | Opcional |
| DELETE | `/api/notes/{id}/link/{target}` | Remover link | Opcional |
| POST | `/api/notes/{id}/embeddings` | Regenerar embeddings da nota | Opcional |

#### Flashcards
| Método | Path | Descrição | Autenticação |
|---|---|---|---|
| POST | `/api/flashcards/generate` | Gerar flashcards por IA | Opcional |
| GET | `/api/flashcards` | Listar flashcards (filtros: note_id, difficulty) | Opcional |
| GET | `/api/flashcards/due` | Cards pendentes de revisão (FSRS) | Opcional |
| POST | `/api/flashcards/review` | Submeter revisão | Opcional |
| DELETE | `/api/flashcards/{id}` | Deletar flashcard | Opcional |

#### Chat e Sistema
| Método | Path | Descrição | Autenticação |
|---|---|---|---|
| POST | `/api/chat` | Chat RAG — responde apenas com conteúdo indexado | Opcional |
| GET | `/api/health` | Health check (status DB) | Não |
| GET | `/api/settings` | Configurações do sistema | Não |

### 2.4 Pilha Tecnológica Completa

| Camada | Tecnologia | Versão |
|---|---|---|
| **Frontend** | Next.js | 15.x |
| | React | 19.x |
| | TypeScript | 5.7+ |
| | Tailwind CSS | 4.x |
| | shadcn/ui (base-nova) | 4.13+ |
| | recharts | 3.9+ |
| | react-force-graph-2d | 1.27+ |
| | zustand | 5.x |
| | next-themes | 0.4+ |
| **Backend** | Python | 3.12+ |
| | FastAPI | 0.115+ |
| | SQLAlchemy (async) | 2.0+ |
| | Alembic | 1.14+ |
| | Pydantic v2 | 2.10+ |
| **Banco** | PostgreSQL + pgvector | 17 |
| | asyncpg | 0.30+ |
| | pgcrypto (UUIDs) | — |
| **Cache/Fila** | Redis | 7 |
| | Arq | 0.26+ |
| **IA/ML** | Groq SDK (Llama 3.1 8B, 3.3 70B, Whisper v3) | 0.15+ |
| | sentence-transformers (BAAI/bge-m3) | 3.3+ |
| | FSRS (py-fsrs) | 0.5+ |
| **Storage** | Railway Buckets (S3) / Local | — |
| | boto3 | 1.35+ |
| **Mensageria** | Baileys (WhatsApp Web) | 6.7.8 |
| **Infra** | Railway + Nixpacks | — |
| | Docker (dev local) | — |

### 2.5 Pipeline de Ingestão (Fluxo Completo)

```
Upload (JPEG/PNG/PDF/DOCX/CSV/MP3/MP4)
  │
  ├─→ save_file() → S3 / Local Storage
  │
  ├─→ Note criada (content_md = placeholder, source_type definido)
  │
  ├─→ Arq enqueue por source_type:
  │     ├─ ocr  → process_ocr()   → Tesseract (por+eng) → texto
  │     ├─ pdf  → process_pdf()   → MarkItDown → Markdown
  │     ├─ docx → process_pdf()   → MarkItDown → Markdown
  │     ├─ csv  → process_pdf()   → MarkItDown → Markdown
  │     ├─ audio→ process_audio() → Groq Whisper v3 → texto
  │     └─ video→ process_audio() → Groq Whisper v3 → texto
  │
  ├─→ update_note_content() → DB UPDATE content_md
  │
  └─→ generate_embeddings()
        ├─ DELETE note_chunks antigos
        ├─ Split content em chunks (CHUNK_SIZE=500 palavras)
        ├─ sentence-transformers → BAAI/bge-m3 (1024d)
        └─ INSERT INTO note_chunks (content, embedding)
             └─ IVFFlat index (100 lists)
```

### 2.6 Pipeline RAG (Query → Response)

```
POST /api/chat { content: "pergunta" }
  │
  ├─→ embed_query(text) → SentenceTransformer BAAI/bge-m3
  │
  ├─→ search_similar() → pgvector cosine distance (<=>)
  │     └─ SELECT ... ORDER BY embedding <=> :query LIMIT 5
  │
  ├─→ Se chunks vazios:
  │     └─ Fallback: "Nao encontrei nenhum conteudo sobre isso"
  │
  ├─→ Se best_score < SIMILARITY_THRESHOLD (0.40):
  │     └─ Fallback: "Nao tenho informacao suficiente"
  │
  ├─→ Concatena chunks → system_prompt restritivo
  │     └─ "Responda APENAS com base no contexto fornecido"
  │
  ├─→ Groq API → llama-3.1-8b-instant (temperature=0.3, max_tokens=1024)
  │
  └─→ ChatResponse { content, sources[] }
        └─ sources: "[score] chunk_preview..." para cada chunk
```

### 2.7 Variáveis de Ambiente

| Variável | Obrigatória | Padrão | Descrição |
|---|---|---|---|
| `DATABASE_URL` | Sim | `postgresql+asyncpg://...` | Conexão PostgreSQL |
| `REDIS_URL` | Sim | `redis://localhost:6379/0` | Conexão Redis |
| `GROQ_API_KEY` | Sim | — | Chave da API Groq |
| `SECRET_KEY` | Sim | `change-me-in-production` | Chave JWT HS256 |
| `CORS_ORIGINS` | Sim | `http://localhost:3000` | Origens CORS |
| `ENVIRONMENT` | Não | `development` | Ambiente (development/production) |
| `DEV_USE_LOCAL_STORAGE` | Não | `false` | Usar storage local em vez de S3 |
| `LOCAL_STORAGE_PATH` | Não | `./uploads` | Caminho do storage local |
| `S3_ENDPOINT` | Prod | — | Endpoint S3 |
| `S3_BUCKET` | Prod | `zapcards-files` | Nome do bucket |
| `S3_ACCESS_KEY` | Prod | — | Chave de acesso S3 |
| `S3_SECRET_KEY` | Prod | — | Chave secreta S3 |
| `S3_REGION` | Prod | `auto` | Região S3 |
| `SIMILARITY_THRESHOLD` | Não | `0.40` | Threshold de similaridade RAG |
| `EMBEDDING_MODEL` | Não | `BAAI/bge-m3` | Modelo de embeddings |
| `CHUNK_SIZE` | Não | `500` | Tamanho de chunk (palavras) |
| `CHUNK_OVERLAP` | Não | `50` | Sobreposição entre chunks |
| `BACKEND_URL` | Não | `http://localhost:8000` | URL da API |
| `FRONTEND_URL` | Não | `http://localhost:3000` | URL do frontend |

---

## 3. Erros Críticos Corrigidos

### 3.1 Histórico de Correções (Linha do Tempo)

| Data | Commit | Problema | Correção |
|---|---|---|---|
| 20/07/2026 | `f54297f` | Embeddings não eram gerados após criação de nota — chunks criados mas vetores nulos | Corrigida chamada ao modelo sentence-transformers e fluxo de chunking no worker `generate_embeddings` |
| 20/07/2026 | — | WhatsApp bot só respondia a "treinar" — sem acesso ao conteúdo completo das notas | Adicionados comandos `notas`, `ler <n>`, `ver <titulo>` com visualização completa do Markdown |
| 20/07/2026 | — | API do frontend sem tipagem — `any` em todas as respostas, zero type safety | Criado `types.ts` com 16 interfaces TypeScript; `api.ts` reescrito com genéricos |
| 22/07/2026 | `649fb86` | `get_db()` fazia commit automático em requisições GET — transações desnecessárias e risco de rollback indevido | Criado `get_db_read()` para leitura; rotas GET usam sessão read-only |
| 22/07/2026 | `649fb86` | Workers duplicavam ~80 linhas de infraestrutura (DB engine, S3 client, modelo embedding, config) — código repetido entre `backend/` e `workers/` | Workers importam de `app.core.*` do módulo backend via `PYTHONPATH`; adicionado `cryptography` às dependências |
| 22/07/2026 | `649fb86` | Embeddings gerados via `asyncio.create_task` no event loop do FastAPI — bloqueava o loop e não tinha retry/fault-tolerance | Substituído por `arq.enqueue_job("generate_embeddings")` via Redis |
| 22/07/2026 | `649fb86` | Sem ambiente de desenvolvimento local padronizado — cada serviço exigia setup manual | Criado `docker-compose.yml` com PostgreSQL+pgvector, Redis, backend, workers, frontend + Dockerfiles |
| 22/07/2026 | `649fb86` | Logging inconsistente — mistura de `print` com `logger` sem formato padrão | Adicionado `core/logging.py` com JSON formatter estruturado (timestamp ISO, level, módulo, função, linha, exceção) |
| 22/07/2026 | `649fb86` | Workers usavam `Groq` síncrono em funções `async` — potencial bloqueio do event loop | Alterado para `AsyncGroq` no `process_audio` |

### 3.2 Detalhamento dos Correções da Auditoria (22/07/2026)

#### P0.1 — Transações Read vs Write
**Arquivo**: `backend/app/core/database.py`  
**Antes**: `get_db()` sempre executava `session.commit()` ao final de cada requisição, independente do método HTTP. Isso causava:
- Transações write desnecessárias em GET/HEAD (desperdício de recursos)
- Risco de rollback em GETs afetar conexões do pool

**Depois**: 
- `get_db_read()` — sessão sem commit, apenas close ao final — usada em rotas GET
- `get_db()` — sessão com commit/rollback — usada em POST/PATCH/DELETE  
- `get_db_or_read(method)` — helper que seleciona automaticamente
- Rotas migradas: `chat.py`, `notes.py` (list_notes, get_note, list_tags, graph_data, embeddings_stats)

#### P0.2 — Workers DRY
**Arquivo**: `workers/app/main.py` (reescrito) + `workers/railway.json`  
**Antes**: Workers definiam engine SQLAlchemy, S3 client, modelo embedding e config próprios — duplicando código do `backend/app/core/`  

**Depois**: Workers importam diretamente do módulo backend:
- `app.core.config` → settings (DATABASE_URL, GROQ_API_KEY, CHUNK_SIZE, EMBEDDING_MODEL)
- `app.core.s3` → get_file() (unificado com backend)
- `app.core.database` → async_session (compartilhado)
- Workers mantêm apenas seu `app/main.py` com as funções de job

#### P1.1 — Tipagem Frontend
**Arquivos novos**: `frontend/src/lib/types.ts` (16 interfaces)  
**Arquivo modificado**: `frontend/src/lib/api.ts`  
**Antes**: `request<any>()` em todas as chamadas, sem tipos nos retornos  
**Depois**: `request<NoteOut[]>()`, `request<ChatResponse>()`, etc. + `ApiError` class

#### P1.2 — Embeddings via Fila
**Arquivo**: `backend/app/api/notes.py`  
**Antes**: `asyncio.create_task(_do_trigger(note_id))` — criava task no event loop do FastAPI, bloqueando-o durante geração de embeddings (CPU-intensivo)  
**Depois**: `await pool.enqueue_job("generate_embeddings", note_id)` — enfileira no Redis, workers processam assincronamente com retry e fault-tolerance

---

## 4. Diagramas

Os diagramas C4 e de fluxo estão em arquivos Draw.io editáveis em `docs/architecture/`:

| Diagrama | Arquivo | Conteúdo |
|---|---|---|
| **C4 Contexto** | `c4-context.drawio` | Sistema no contexto de usuários (web, WhatsApp, API) e serviços externos (Groq, Railway, S3, WhatsApp) |
| **C4 Container** | `c4-container.drawio` | Todos os 6 containers: frontend, backend, workers, WhatsApp bot, PostgreSQL, Redis — com conexões, tecnologias e fluxos de dados |
| **RAG + Ingestão** | `rag-ingestion-flow.drawio` | Pipeline completo de ingestão (upload → OCR/PDF/áudio → update → chunk → embed) + RAG (query → vectorize → search → threshold → LLM → response) + Flashcard generation + FSRS review cycle |

Abra qualquer `.drawio` em [app.diagrams.net](https://app.diagrams.net) ou no VS Code com extensão Draw.io.

### 4.1 Estrutura de Diretórios dos Diagramas

```
docs/
├── architecture/
│   ├── c4-context.drawio         ← C4 Nível 1 (Contexto do Sistema)
│   ├── c4-container.drawio       ← C4 Nível 2 (Containers)
│   └── rag-ingestion-flow.drawio ← Pipeline RAG + Ingestão + Flashcards
└── ZapCardHistory.md             ← Este documento
```

---

## 5. Pendências para Sprints Futuras

| # | Prioridade | Item | Impacto |
|---|---|---|---|
| 1 | P1 | WhatsApp Bot: migrar `fetch` para API client com retry/timeout/tipagem | Confiabilidade do bot |
| 2 | P2 | Rate limiting na API (slowapi ou middleware) | Segurança/estabilidade |
| 3 | P2 | Frontend `ErrorBoundary` global | UX em falhas |
| 4 | P2 | Testes unitários no frontend (Vitest + Testing Library) | Cobertura de testes |
| 5 | P3 | CI/CD pipeline (GitHub Actions: lint, test, build) | Automação |
| 6 | P3 | Migrar WhatsApp de Baileys para Meta Cloud API oficial | Compliance/estabilidade |
| 7 | P3 | Métricas Prometheus + Grafana dashboard | Observabilidade |
| 8 | P3 | Migrar embeddings para GPU ou API externa (escala) | Performance |

---

## 6. Comandos Úteis

### Desenvolvimento Local

```bash
# Subir tudo com Docker
docker compose up -d

# Apenas banco de dados
docker compose up -d postgres redis

# Backend
cd backend
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Workers
cd workers
PYTHONPATH=../backend arq app.main.WorkerSettings

# Frontend
cd frontend
npm install
npm run dev
```

### Testes

```bash
# Criar banco de teste
createdb zapcards_test

# Executar testes
cd backend
pytest tests/ -v

# Verificar tipos frontend
cd frontend
npx tsc --noEmit
```

### WhatsApp Bot

```bash
cd whatsapp-bot
npm install
BACKEND_URL=http://localhost:8000 node src/index.js
# Escaneie QR code em http://localhost:3000/qr.png
```

### Deploy

O deploy é automático via Railway (git push na branch master). Cada serviço tem seu `railway.json` com o comando de start.

---

*Documento gerado em 22/07/2026 durante auditoria arquitetural. Último commit: `649fb86`.*
