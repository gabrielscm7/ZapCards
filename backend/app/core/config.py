import re

from pydantic_settings import BaseSettings


def _normalize_database_url(url: str) -> str:
    if url.startswith("postgresql+asyncpg://") or url.startswith("postgresql+psycopg://"):
        return url
    url = re.sub(r"^postgres(ql)?://", "postgresql+asyncpg://", url)
    return url


class Settings(BaseSettings):
    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/zapcards"
    REDIS_URL: str = "redis://localhost:6379/0"

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.DATABASE_URL = _normalize_database_url(self.DATABASE_URL)

    GROQ_API_KEY: str = ""

    S3_ENDPOINT: str = ""
    S3_BUCKET: str = "zapcards-files"
    S3_ACCESS_KEY: str = ""
    S3_SECRET_KEY: str = ""
    S3_REGION: str = "auto"

    SECRET_KEY: str = "change-me-in-production"
    CORS_ORIGINS: str = "http://localhost:3000"
    ENVIRONMENT: str = "development"

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT == "production"

    EMBEDDING_MODEL: str = "BAAI/bge-m3"
    SIMILARITY_THRESHOLD: float = 0.40
    CHUNK_SIZE: int = 500
    CHUNK_OVERLAP: int = 50

    BACKEND_URL: str = "http://localhost:8000"
    FRONTEND_URL: str = "http://localhost:3000"

    DEV_USE_LOCAL_STORAGE: bool = False
    LOCAL_STORAGE_PATH: str = "./uploads"


settings = Settings()
