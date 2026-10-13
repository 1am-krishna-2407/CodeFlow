import os
from typing import ClassVar, Optional

from .docker_executor import DockerSandbox, ExecutionResult, SandboxLimits

# Materialise the program and its stdin inside the tmpfs; bail out if that fails.
WRITE_INPUTS = '{{ printf "%s" "$CODEFLOW_SOURCE" > {filename} && printf "%s" "$CODEFLOW_STDIN" > .stdin; }} || exit 125'


class Executor:
    """One supported language: which image to use, how to build and run a program, and its limits.

    Images and memory caps can be overridden per language, e.g. PYTHON_IMAGE / PYTHON_MEMORY_LIMIT.
    """

    language: ClassVar[str]
    default_image: ClassVar[str]
    filename: ClassVar[str]
    compile_command: ClassVar[Optional[str]] = None
    run_command: ClassVar[str]  # stdin is redirected from the job's input automatically
    default_memory: ClassVar[str] = "128m"
    pids: ClassVar[int] = 64

    def __init__(self, sandbox: Optional[DockerSandbox] = None):
        self.sandbox = sandbox or DockerSandbox()

    @property
    def image(self) -> str:
        return os.getenv(f"{self.language.upper()}_IMAGE", self.default_image)

    @property
    def limits(self) -> SandboxLimits:
        return SandboxLimits(
            memory=os.getenv(f"{self.language.upper()}_MEMORY_LIMIT", self.default_memory),
            cpus=float(os.getenv("EXECUTOR_CPUS", "1.0")),
            pids=self.pids,
        )

    @property
    def script(self) -> str:
        parts = [WRITE_INPUTS.format(filename=self.filename), "@@MARK:start@@"]
        if self.compile_command:
            # Timed separately so "run time" means the user's program, not the compiler.
            parts.append(f"{{ {self.compile_command}; }}; rc=$?; @@MARK:compiled@@; [ $rc -eq 0 ] || exit $rc")
        parts.append(f"{self.run_command} < .stdin; rc=$?; @@MARK:end@@; exit $rc")
        return "; ".join(parts)

    def execute(self, source: str, stdin: Optional[str] = None, timeout: int = 10) -> ExecutionResult:
        return self.sandbox.run(self.image, self.script, source, stdin, timeout, self.limits)
