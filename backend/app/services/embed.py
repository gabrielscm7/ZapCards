import json

from sentence_transformers import SentenceTransformer

from app.core.config import settings

_model: SentenceTransformer | None = None


def _get_model() -> SentenceTransformer:
    global _model
    if _model is None:
        _model = SentenceTransformer(settings.EMBEDDING_MODEL)
    return _model


async def embed_query(text: str) -> list[float]:
    model = _get_model()
    return model.encode(text).tolist()


async def embed_texts(texts: list[str]) -> list[list[float]]:
    model = _get_model()
    return model.encode(texts).tolist()


def _to_embedding_str(embedding: list[float]) -> str:
    return json.dumps(embedding)


async def search_similar(db, query_embedding: list[float], limit: int = 5) -> list[tuple[str, float]]:
    from sqlalchemy import text
    embedding_str = _to_embedding_str(query_embedding)
    result = await db.execute(
        text(
            """SELECT nc.content, 1 - (nc.embedding <=> :embedding) AS similarity
               FROM note_chunks nc
               WHERE nc.embedding IS NOT NULL
               ORDER BY nc.embedding <=> :embedding
               LIMIT :limit"""
        ),
        {"embedding": embedding_str, "limit": limit},
    )
    return [(row[0], row[1]) for row in result.fetchall()]
