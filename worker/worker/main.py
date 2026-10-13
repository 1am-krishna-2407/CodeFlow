import logging
import signal
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from typing import Optional

import redis

from worker.config import WorkerConfig
from worker.db import JobStore, make_engine, utcnow
from worker.executors import EXECUTORS, DockerSandbox, SandboxUnavailable, UnsupportedLanguage, get_executor
from worker.queue import PROCESSING_PREFIX, JobQueue

logger = logging.getLogger("codeflow.worker")

USER_FACING_ENGINE_ERROR = "The execution service could not run this job. Please try again later."


def process_job(job_id: str, store: JobStore, sandbox: DockerSandbox, timeout: int) -> Optional[str]:
    """Run one job end to end. Returns the final status, or None if the job wasn't ours to run."""
    try:
        job_uuid = uuid.UUID(job_id)
    except ValueError:
        logger.warning("Dropping malformed queue entry %r", job_id)
        return None

    job = store.claim(job_uuid)
    if job is None:
        # Deleted before we got to it, or already claimed after a duplicate enqueue.
        logger.info("Job %s is not claimable, skipping", job_id)
        return None

    try:
        result = get_executor(job.language, sandbox).execute(job.source_code, job.stdin, timeout=timeout)
    except UnsupportedLanguage as exc:
        store.fail(job_uuid, str(exc))
        return "failed"
    except SandboxUnavailable:
        logger.exception("Sandbox unavailable while running job %s", job_id)
        store.fail(job_uuid, USER_FACING_ENGINE_ERROR)
        return "failed"
    except Exception:
        logger.exception("Unexpected error running job %s", job_id)
        store.fail(job_uuid, USER_FACING_ENGINE_ERROR)
        return "failed"

    status = "timeout" if result.timed_out else "completed" if result.exit_code == 0 else "failed"
    store.finish(
        job_uuid, status, result.stdout, result.stderr, result.exit_code, result.duration, result.compile_time
    )
    logger.info(
        "Job %s finished: status=%s exit=%s compile=%ss run=%ss",
        job_id, status, result.exit_code, result.compile_time, result.duration,
    )
    return status


class Worker:
    def __init__(self, config: WorkerConfig, queue: JobQueue, store: JobStore, sandbox: DockerSandbox):
        self.config = config
        self.queue = queue
        self.store = store
        self.sandbox = sandbox
        self.stopping = threading.Event()
        self._slots = threading.BoundedSemaphore(config.concurrency)
        self._last_reap = 0.0

    def recover_orphans(self, at_startup: bool = False) -> int:
        """Requeue jobs held by workers that died; at startup, also this worker's previous incarnation."""
        recovered = 0
        for key in self.queue.orphaned_processing_keys(include_own=at_startup):
            self._remove_leftover_sandboxes(key[len(PROCESSING_PREFIX):])
            for job_id in self.queue.peek_all(key):
                try:
                    self.store.reset_to_queued(uuid.UUID(job_id))
                except ValueError:
                    pass
            while self.queue.requeue_one(key) is not None:
                recovered += 1
        if recovered:
            logger.warning("Requeued %d job(s) abandoned by stopped workers", recovered)
        return recovered

    def _remove_leftover_sandboxes(self, owner: str) -> None:
        try:
            removed = self.sandbox.remove_containers_of(owner)
            if removed:
                logger.warning("Removed %d leftover sandbox container(s) from worker %s", removed, owner)
        except Exception:
            logger.exception("Could not clean up sandbox containers of worker %s", owner)

    def reap_stale(self) -> int:
        """Fail jobs stuck in running far past any possible deadline (e.g. their queue entry was lost)."""
        cutoff = utcnow() - timedelta(seconds=self.config.timeout_seconds * 3 + 300)
        stale = self.store.stale_running(cutoff)
        for job_id in stale:
            self.store.fail(job_id, "Job was lost by the execution service. Please resubmit it.")
        if stale:
            logger.warning("Marked %d stale running job(s) as failed", len(stale))
        return len(stale)

    def prepull_images(self) -> None:
        for executor_cls in EXECUTORS.values():
            image = executor_cls(self.sandbox).image
            try:
                logger.info("Ensuring sandbox image %s is present", image)
                self.sandbox.ensure_image(image)
            except Exception:
                logger.exception("Could not pull %s; it will be retried on first use", image)

    def _housekeeping(self) -> None:
        self.queue.heartbeat()
        now = time.monotonic()
        if now - self._last_reap >= self.config.reap_interval_seconds:
            self._last_reap = now
            try:
                self.recover_orphans()
                self.reap_stale()
            except Exception:
                logger.exception("Housekeeping failed")

    def _handle(self, job_id: str) -> None:
        try:
            process_job(job_id, self.store, self.sandbox, self.config.timeout_seconds)
        except Exception:
            # Only reachable if the database itself is failing; the job stays in our processing
            # list and will be recovered after a restart.
            logger.exception("Could not record outcome of job %s", job_id)
            return
        finally:
            self._slots.release()
        self.queue.ack(job_id)

    def run(self) -> None:
        logger.info("Worker %s starting with concurrency=%d", self.config.worker_id, self.config.concurrency)
        self.queue.heartbeat()
        self.recover_orphans(at_startup=True)
        if self.config.prepull_images:
            threading.Thread(target=self.prepull_images, name="prepull", daemon=True).start()

        with ThreadPoolExecutor(max_workers=self.config.concurrency, thread_name_prefix="job") as pool:
            while not self.stopping.is_set():
                holding_slot = False
                try:
                    self._housekeeping()
                    if not self._slots.acquire(timeout=1):
                        continue  # all slots busy
                    holding_slot = True
                    job_id = self.queue.pop(timeout=2)
                    if job_id is not None:
                        pool.submit(self._handle, job_id)
                        holding_slot = False  # _handle releases it
                except redis.RedisError:
                    logger.exception("Redis error; retrying shortly")
                    self.stopping.wait(2)
                finally:
                    if holding_slot:
                        self._slots.release()
            logger.info("Stop requested; waiting for in-flight jobs to finish")
        logger.info("Worker stopped")


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    config = WorkerConfig()
    client = redis.Redis.from_url(config.redis_url, socket_connect_timeout=5, socket_timeout=10)
    worker = Worker(config, JobQueue(client, config.worker_id), JobStore(make_engine(config.database_url)),
                    DockerSandbox(owner=config.worker_id))

    def _stop(signum, _frame):
        logger.info("Received signal %s", signum)
        worker.stopping.set()

    signal.signal(signal.SIGTERM, _stop)
    signal.signal(signal.SIGINT, _stop)
    worker.run()


if __name__ == "__main__":
    main()
