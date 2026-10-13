"""DockerSandbox behaviour against a fake Docker client (no daemon needed)."""
import pytest
import requests
from docker.errors import ImageNotFound

from worker.executors import CppExecutor, JavaExecutor, PythonExecutor, SandboxLimits, get_executor
from worker.executors.docker_executor import MAX_OUTPUT_BYTES, DockerSandbox, _clean_output


class FakeContainer:
    def __init__(self, exit_code=0, stdout=b"", stderr=b"", hang=False, oom=False):
        self.exit_code, self.stdout, self.stderr, self.hang, self.oom = exit_code, stdout, stderr, hang, oom
        self.started = self.killed = self.removed = False
        self.attrs = {"State": {"OOMKilled": oom}}

    def start(self):
        self.started = True

    def wait(self, timeout):
        if self.hang:
            import time

            time.sleep(timeout)
            raise requests.exceptions.ReadTimeout()
        return {"StatusCode": self.exit_code}

    def kill(self):
        self.killed = True

    def logs(self, stdout, stderr):
        return self.stdout if stdout else self.stderr

    def reload(self):
        pass

    def remove(self, force=False):
        self.removed = True


class FakeDocker:
    def __init__(self, container, missing_image=False):
        self.container = container
        self.missing_image = missing_image
        self.create_kwargs = None
        self.pulled = []
        self.containers = self
        self.images = self

    # containers API
    def create(self, image, **kwargs):
        if self.missing_image:
            raise ImageNotFound("no such image")
        self.create_kwargs = {"image": image, **kwargs}
        return self.container

    # images API
    def get(self, image):
        if self.missing_image:
            raise ImageNotFound("no such image")

    def pull(self, image):
        self.pulled.append(image)
        self.missing_image = False


def run(container, executor_cls=PythonExecutor, timeout=5, **kwargs):
    fake = FakeDocker(container, **kwargs)
    result = executor_cls(DockerSandbox(client=fake)).execute("print('hi')", "in", timeout=timeout)
    return result, fake


def test_container_is_locked_down():
    _, fake = run(FakeContainer(stdout=b"hi\n"))
    kw = fake.create_kwargs
    assert kw["network_mode"] == "none"
    assert kw["read_only"] is True
    assert kw["user"] == "65534:65534"
    assert kw["cap_drop"] == ["ALL"]
    assert "no-new-privileges:true" in kw["security_opt"]
    assert kw["pids_limit"] == 64
    assert kw["mem_limit"] == kw["memswap_limit"] == "128m"
    assert "size=" in kw["tmpfs"]["/tmp"]
    assert "volumes" not in kw  # nothing from the worker is mounted in
    assert kw["environment"]["CODEFLOW_SOURCE"] == "print('hi')"
    assert kw["environment"]["CODEFLOW_STDIN"] == "in"


def test_successful_run():
    container = FakeContainer(stdout=b"hi\n", stderr=b"")
    result, _ = run(container)
    assert (result.stdout, result.stderr, result.exit_code, result.timed_out) == ("hi\n", "", 0, False)
    assert container.removed


def test_timeout_kills_container_and_keeps_partial_output():
    container = FakeContainer(hang=True, stdout=b"partial")
    result, _ = run(container, timeout=1)
    assert result.timed_out and result.exit_code == -1
    assert result.stdout == "partial"
    assert "timed out after 1 seconds" in result.stderr
    assert container.killed and container.removed


def test_oom_is_reported():
    result, _ = run(FakeContainer(exit_code=137, oom=True))
    assert "Memory limit exceeded" in result.stderr


def test_missing_image_is_pulled_then_run():
    container = FakeContainer(stdout=b"ok")
    result, fake = run(container, missing_image=True)
    assert fake.pulled == ["python:3.11-slim"]
    assert result.stdout == "ok"


def test_container_removed_even_if_logs_fail():
    container = FakeContainer()
    container.logs = lambda **_: (_ for _ in ()).throw(RuntimeError("boom"))
    with pytest.raises(RuntimeError):
        run(container)
    assert container.removed


def test_output_is_truncated_and_nul_safe():
    assert _clean_output(b"a\x00b") == "a�b"
    big = _clean_output(b"x" * (MAX_OUTPUT_BYTES + 10))
    assert big.startswith("x" * MAX_OUTPUT_BYTES)
    assert "output truncated" in big


def test_language_specific_limits_and_overrides(monkeypatch):
    assert JavaExecutor().limits.pids == 128
    assert CppExecutor().limits.memory == "256m"
    monkeypatch.setenv("PYTHON_IMAGE", "python:3.12-slim")
    monkeypatch.setenv("PYTHON_MEMORY_LIMIT", "64m")
    assert PythonExecutor().image == "python:3.12-slim"
    assert PythonExecutor().limits == SandboxLimits(memory="64m", cpus=1.0, pids=64)


def test_get_executor_rejects_unknown_language():
    assert isinstance(get_executor(" Python "), PythonExecutor)
    with pytest.raises(ValueError):
        get_executor("bash")


def test_timing_markers_are_parsed_and_stripped():
    from worker.executors.docker_executor import extract_timings, render_script

    script = render_script(JavaExecutor().script, "tok1")
    assert "@@MARK" not in script and script.count("@@cf-") == 3

    raw = (b"warning: x"
           b"\n@@cf-tok1 start 1000000000\n"
           b"\n@@cf-tok1 compiled 1800000000\n"
           b"Exception in thread main"
           b"\n@@cf-tok1 end 1900000000\n")
    clean, marks = extract_timings(raw, "tok1")
    assert clean == b"warning: xException in thread main"
    assert marks == {"start": 1_000_000_000, "compiled": 1_800_000_000, "end": 1_900_000_000}
    # Markers carrying a different token (e.g. printed by the program) are left alone.
    assert extract_timings(b"\n@@cf-other end 5\n", "tok1")[1] == {}


def test_run_reports_compile_and_program_time_separately():
    import re

    class TimedContainer(FakeContainer):
        def logs(self, stdout, stderr):
            if stdout:
                return b"hi\n"
            token = re.search(r"%s %s %s\S*' (\w+) start", fake.create_kwargs["command"][2]).group(1)
            return (f"\n@@cf-{token} start 1000000000\n\n@@cf-{token} compiled 1750000000\n"
                    f"\n@@cf-{token} end 1800000000\n").encode()

    container = TimedContainer()
    fake = FakeDocker(container)
    result = JavaExecutor(DockerSandbox(client=fake)).execute("class Main {}", timeout=5)
    assert result.compile_time == 0.75
    assert result.duration == 0.05
    assert result.stderr == ""
