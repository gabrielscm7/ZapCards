import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api import notes, flashcards, chat, import_
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


@app.get("/api/health")
async def health():
    db_ok = getattr(app.state, "db_ok", False)
    return {
        "status": "ok",
        "service": "zapcards-backend",
        "database": "connected" if db_ok else "unavailable",
    }
