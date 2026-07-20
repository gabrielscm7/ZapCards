from fastapi import APIRouter

router = APIRouter()


@router.get("/settings")
async def get_settings():
    from app.core.config import settings as s

    return {
        "rag": {
            "similarity_threshold": s.SIMILARITY_THRESHOLD,
            "embedding_model": s.EMBEDDING_MODEL,
            "chunk_size": s.CHUNK_SIZE,
            "chunk_overlap": s.CHUNK_OVERLAP,
        },
        "environment": s.ENVIRONMENT,
        "storage": {
            "bucket": s.S3_BUCKET,
            "region": s.S3_REGION,
            "local_mode": s.DEV_USE_LOCAL_STORAGE,
        },
    }
