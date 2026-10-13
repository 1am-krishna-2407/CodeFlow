"""Redis job queue producer. The consumer side lives in worker/worker/queue.py; keep the key in sync."""
from typing import Optional

import redis

from app.core.config import settings

QUEUE_KEY = "codeflow:jobs:queue"


class QueueUnavailable(Exception):
    pass


_client: Optional[redis.Redis] = None


def get_redis() -> redis.Redis:
    global _client
    if _client is None:
        _client = redis.Redis.from_url(settings.REDIS_URL, socket_connect_timeout=2, socket_timeout=2)
    return _client


def enqueue_job(job_id: str) -> None:
    try:
        get_redis().lpush(QUEUE_KEY, job_id)
    except redis.RedisError as exc:
        raise QueueUnavailable(str(exc)) from exc


def ping() -> bool:
    try:
        return bool(get_redis().ping())
    except redis.RedisError:
        return False
