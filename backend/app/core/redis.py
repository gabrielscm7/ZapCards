import logging

from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import settings

logger = logging.getLogger(__name__)

_redis_pool = None


def _get_redis_settings():
    return RedisSettings.from_dsn(settings.REDIS_URL)


async def get_redis():
    global _redis_pool
    if _redis_pool is None:
        try:
            _redis_pool = await create_pool(_get_redis_settings())
            logger.info("Redis connection pool created")
        except Exception as e:
            logger.warning("Redis unavailable: %s", e)
            raise
    return _redis_pool


async def get_redis_settings_safe():
    try:
        return _get_redis_settings()
    except Exception as e:
        logger.warning("Could not parse REDIS_URL: %s", e)
        return None
