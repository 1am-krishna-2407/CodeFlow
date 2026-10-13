"""Runs untrusted code in a locked-down, throwaway Docker container.

Code and stdin are delivered through environment variables and written into a size-capped tmpfs by the
container itself, so nothing is bind-mounted from the worker (no host-path mapping, no temp-dir cleanup)
and the root filesystem can stay read-only.
"""
import os
import re
import secrets
import threading
import time
from dataclasses import dataclass
from typing import Optional

try:
    import docker
    import requests
    from docker.errors import APIError, ImageNotFound, NotFound
    from docker.types import LogConfig, Ulimit
except ImportError:  # pragma: no cover - docker is a hard dependency in the worker image
    docker = None

MAX_OUTPUT_BYTES = int(os.getenv("MAX_OUTPUT_BYTES", str(64 * 1024)))
TRUNCATION_NOTICE = "\n[output truncated: exceeded {limit} bytes]"
SANDBOX_USER = "65534:65534"  # nobody:nogroup


class SandboxUnavailable(RuntimeError):
    """Docker itself could not be used; the job did not run."""


@dataclass(frozen=True)
class SandboxLimits:
    memory: str = "128m"
    cpus: float = 0.5
    pids: int = 64
    tmpfs_size: str = "64m"
    nofile: int = 1024


@dataclass(frozen=True)
class ExecutionResult:
    stdout: str
    stderr: str
    exit_code: int
    timed_out: bool
    duration: Optional[float]  # seconds the program ran; container wall time if unknown; None if it never ran
    compile_time: Optional[float] = None  # seconds spent compiling, for compiled languages


# Scripts mark phase boundaries with "@@MARK:<phase>@@". Each run replaces it with a command that
# writes a timestamp line, tagged with a fresh random token, to stderr; the worker then strips those
# lines back out. A program could forge a marker only by reading its own command line, and the most
# it could do is misreport its own timings.
_MARK_PLACEHOLDER = re.compile(r"@@MARK:(\w+)@@")


def render_script(script: str, token: str) -> str:
    return _MARK_PLACEHOLDER.sub(
        lambda m: f"printf '\\n@@cf-%s %s %s\\n' {token} {m.group(1)} \"$(date +%s%N)\" >&2", script
    )


def extract_timings(raw_stderr: bytes, token: str):
    """Remove timing markers from stderr; return (clean stderr, {phase: epoch_ns})."""
    pattern = re.compile(rb"\n?@@cf-" + token.encode() + rb" (\w+) (\d+)\n")
    marks = {m.group(1).decode(): int(m.group(2)) for m in pattern.finditer(raw_stderr)}
    return pattern.sub(b"", raw_stderr), marks


def _seconds(marks: dict, start: str, end: str) -> Optional[float]:
    if start in marks and end in marks and marks[end] >= marks[start]:
        return round((marks[end] - marks[start]) / 1e9, 3)
    return None


def _clean_output(raw: bytes, limit: int = MAX_OUTPUT_BYTES) -> str:
    truncated = len(raw) > limit
    text = raw[:limit].decode("utf-8", errors="replace")
    # Postgres TEXT cannot store NUL; a program printing "\0" must not make the result unsaveable.
    text = text.replace("\x00", "�")
    return text + TRUNCATION_NOTICE.format(limit=limit) if truncated else text


OWNER_LABEL = "codeflow.worker"


class DockerSandbox:
    def __init__(self, client=None, owner: str = "unknown"):
        self._client = client
        self.owner = owner  # labelled on every container so a dead worker's leftovers can be found
        # docker-py clients wrap a requests Session, which isn't safe to share across threads.
        self._local = threading.local()

    @property
    def client(self):
        if self._client is not None:
            return self._client
        if not hasattr(self._local, "client"):
            if docker is None:
                raise SandboxUnavailable("docker Python package is not installed")
            try:
                self._local.client = docker.from_env()
            except Exception as exc:
                raise SandboxUnavailable(f"Docker daemon unavailable: {exc}") from exc
        return self._local.client

    def ensure_image(self, image: str) -> None:
        try:
            self.client.images.get(image)
        except ImageNotFound:
            self.client.images.pull(image)

    def _create(self, image: str, script: str, env: dict, limits: SandboxLimits):
        return self.client.containers.create(
            image,
            command=["sh", "-c", script],
            environment=env,
            user=SANDBOX_USER,
            working_dir="/tmp",
            network_mode="none",
            read_only=True,
            tmpfs={"/tmp": f"rw,exec,nosuid,nodev,size={limits.tmpfs_size},mode=1777"},
            mem_limit=limits.memory,
            memswap_limit=limits.memory,  # equal to mem_limit: no swap on top of the memory cap
            nano_cpus=int(limits.cpus * 1_000_000_000),
            pids_limit=limits.pids,
            cap_drop=["ALL"],
            security_opt=["no-new-privileges:true"],
            ulimits=[Ulimit(name="nofile", soft=limits.nofile, hard=limits.nofile)],
            # Bounds what a print-loop can make the daemon (and then the worker) hold in memory.
            log_config=LogConfig(type=LogConfig.types.JSON, config={"max-size": "1m", "max-file": "1"}),
            labels={"codeflow.sandbox": "true", OWNER_LABEL: self.owner},
        )

    def run(
        self, image: str, script: str, source: str, stdin: Optional[str], timeout: int, limits: SandboxLimits
    ) -> ExecutionResult:
        env = {
            "CODEFLOW_SOURCE": source,
            "CODEFLOW_STDIN": stdin or "",
            "HOME": "/tmp",
            "TMPDIR": "/tmp",
            "PYTHONUNBUFFERED": "1",  # keep partial output when a job is killed on timeout
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        token = secrets.token_hex(8)
        script = render_script(script, token)
        try:
            try:
                container = self._create(image, script, env, limits)
            except ImageNotFound:
                self.ensure_image(image)
                container = self._create(image, script, env, limits)
        except APIError as exc:
            raise SandboxUnavailable(f"Could not create sandbox container: {exc}") from exc
        except requests.exceptions.ConnectionError as exc:
            raise SandboxUnavailable(f"Docker daemon unreachable: {exc}") from exc

        try:
            started = time.monotonic()
            container.start()
            timed_out = False
            try:
                exit_code = container.wait(timeout=timeout).get("StatusCode", -1)
            except (requests.exceptions.ReadTimeout, requests.exceptions.ConnectionError):
                if time.monotonic() - started < timeout:
                    raise  # a real connectivity failure, not the program running long
                timed_out = True
                exit_code = -1
                try:
                    container.kill()
                except (APIError, NotFound):
                    pass  # it may have exited on its own just after the deadline
            wall_time = round(time.monotonic() - started, 3)

            stdout = _clean_output(container.logs(stdout=True, stderr=False))
            raw_stderr, marks = extract_timings(container.logs(stdout=False, stderr=True), token)
            stderr = _clean_output(raw_stderr)
            compile_time = _seconds(marks, "start", "compiled")
            run_time = _seconds(marks, "compiled" if "compiled" in marks else "start", "end")
            if "compiled" in marks and "end" not in marks and not timed_out:
                duration = None  # compilation failed, so the program never ran
            elif run_time is not None and not timed_out:
                duration = run_time
            else:
                duration = wall_time  # timeout or the shell itself was killed: wall time is all we have

            if timed_out:
                stderr = (stderr + "\n" if stderr else "") + f"Execution timed out after {timeout} seconds."
            elif exit_code == 137 and self._oom_killed(container):
                stderr = (stderr + "\n" if stderr else "") + f"Memory limit exceeded ({limits.memory})."
            return ExecutionResult(stdout, stderr, exit_code, timed_out, duration, compile_time)
        finally:
            try:
                container.remove(force=True)
            except (APIError, NotFound):
                pass

    def remove_containers_of(self, owner: str) -> int:
        """Force-remove sandboxes left behind by a worker that died before it could clean up."""
        removed = 0
        for container in self.client.containers.list(all=True, filters={"label": f"{OWNER_LABEL}={owner}"}):
            try:
                container.remove(force=True)
                removed += 1
            except (APIError, NotFound):
                pass
        return removed

    @staticmethod
    def _oom_killed(container) -> bool:
        try:
            container.reload()
            return bool(container.attrs.get("State", {}).get("OOMKilled"))
        except (APIError, NotFound):
            return False
