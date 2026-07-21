import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import notes, flashcards, chat, import_, auth, settings as settings_api
from app.core.config import settings
from app.core.database import engine, Base
import app.models  # noqa: F401 — registers all models

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    db_ok = False
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
            await conn.execute(text("CREATE EXTENSION IF NOT EXISTS pgcrypto"))
        db_ok = True
        logger.info("Database initialized successfully")
    except Exception:
        logger.warning("Database unavailable at startup — schema migration skipped")
    app.state.db_ok = db_ok
    yield


app = FastAPI(
    title="ZapCards API",
    description="Sistema de estudos por flashcards com IA",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(notes.router, prefix="/api/notes", tags=["notes"])
app.include_router(import_.router, prefix="/api/notes/import", tags=["import"])
app.include_router(flashcards.router, prefix="/api/flashcards", tags=["flashcards"])
app.include_router(chat.router, prefix="/api/chat", tags=["chat"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(settings_api.router, prefix="/api", tags=["settings"])


@app.get("/api/health")
async def health():
    db_ok = getattr(app.state, "db_ok", False)
    return {
        "status": "ok",
        "service": "zapcards-backend",
        "database": "connected" if db_ok else "unavailable",
    }


@app.get("/api/embeddings/stats")
async def embeddings_stats():
    from sqlalchemy import text
    from app.core.database import async_session
    async with async_session() as db:
        total_emb = await db.execute(text("SELECT COUNT(*) FROM note_chunks WHERE embedding IS NOT NULL"))
        total_notes = await db.execute(text("SELECT COUNT(*) FROM notes"))
        total_chunks = await db.execute(text("SELECT COUNT(*) FROM note_chunks"))
        return {
            "notes_total": total_notes.scalar(),
            "chunks_total": total_chunks.scalar(),
            "chunks_with_embeddings": total_emb.scalar(),
        }


@app.get("/api/embeddings/generate-all")
async def embeddings_generate_all():
    from sqlalchemy import text
    from app.core.database import async_session
    from app.services.embed import schedule_embeddings
    async with async_session() as db:
        result = await db.execute(text("SELECT id FROM notes"))
        note_ids = [str(row[0]) for row in result.fetchall()]
    ok = 0
    fail = 0
    for nid in note_ids:
        try:
            await schedule_embeddings(nid)
            ok += 1
        except Exception as e:
            fail += 1
    return {"status": "ok", "ok": ok, "failed": fail, "total": len(note_ids)}
