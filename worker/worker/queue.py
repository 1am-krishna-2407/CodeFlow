"""Reliable Redis queue consumer. The producer is backend/app/core/queue.py; keep QUEUE_KEY in sync.

Jobs are moved atomically from the shared queue into a per-worker processing list and only removed
once handled, so a worker that dies mid-job leaves a record that another worker can recover.
"""
from typing import List, Optional

import redis

QUEUE_KEY = "codeflow:jobs:queue"
PROCESSING_PREFIX = "codeflow:jobs:processing:"
HEARTBEAT_PREFIX = "codeflow:workers:"
HEARTBEAT_TTL_SECONDS = 30


class JobQueue:
    def __init__(self, client: redis.Redis, worker_id: str):
        self.client = client
        self.worker_id = worker_id
        self.processing_key = PROCESSING_PREFIX + worker_id

    def pop(self, timeout: float) -> Optional[str]:
        # The producer LPUSHes, so the oldest job is on the right.
        raw = self.client.blmove(QUEUE_KEY, self.processing_key, timeout, "RIGHT", "LEFT")
        return raw.decode() if isinstance(raw, bytes) else raw

    def ack(self, job_id: str) -> None:
        self.client.lrem(self.processing_key, 1, job_id)

    def heartbeat(self) -> None:
        self.client.set(HEARTBEAT_PREFIX + self.worker_id, "1", ex=HEARTBEAT_TTL_SECONDS)

    def orphaned_processing_keys(self, include_own: bool = False) -> List[str]:
        """Processing lists whose worker has stopped heart-beating.

        Our own list only counts as orphaned at startup (include_own=True), when anything in it was
        left by this worker's previous life. While running, it holds jobs that are in progress.
        """
        orphaned = []
        for key in self.client.scan_iter(match=PROCESSING_PREFIX + "*"):
            key = key.decode() if isinstance(key, bytes) else key
            owner = key[len(PROCESSING_PREFIX):]
            if owner == self.worker_id:
                if include_own:
                    orphaned.append(key)
            elif not self.client.exists(HEARTBEAT_PREFIX + owner):
                orphaned.append(key)
        return orphaned

    def peek_all(self, key: str) -> List[str]:
        return [v.decode() if isinstance(v, bytes) else v for v in self.client.lrange(key, 0, -1)]

    def requeue_one(self, key: str) -> Optional[str]:
        """Move one entry from a processing list back to the front of the queue."""
        raw = self.client.lmove(key, QUEUE_KEY, "RIGHT", "RIGHT")
        return raw.decode() if isinstance(raw, bytes) else raw
