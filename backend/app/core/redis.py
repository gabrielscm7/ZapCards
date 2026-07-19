from arq import create_pool
from arq.connections import RedisSettings

from app.core.config import settings


async def get_redis():
    return await create_pool(RedisSettings.from_dsn(settings.REDIS_URL))


ARQ_SETTINGS = RedisSettings.from_dsn(settings.REDIS_URL)
