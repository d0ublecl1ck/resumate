import redis

from .config import get_settings

redis_client = redis.Redis.from_url(get_settings().redis_url, decode_responses=True)


def get_redis() -> redis.Redis:
    """Return the process-wide Redis client; sessions are validated against it."""
    return redis_client
