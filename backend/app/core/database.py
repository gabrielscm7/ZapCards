import logging
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

logger = logging.getLogger(__name__)

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.ENVIRONMENT == "development",
    pool_size=20,
    max_overflow=40,
)

async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


@asynccontextmanager
async def _read_session():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()


async def get_db_read() -> AsyncSession:
    async with _read_session() as session:
        yield session


async def get_db() -> AsyncSession:
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            logger.exception("Database error — transaction rolled back")
            raise


async def get_db_or_read(method: str) -> callable:
    if method in ("GET", "HEAD", "OPTIONS"):
        return get_db_read
    return get_db
