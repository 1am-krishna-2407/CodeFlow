from typing import Dict, Optional, Type

from .base import Executor
from .cpp import CppExecutor
from .docker_executor import DockerSandbox, ExecutionResult, SandboxLimits, SandboxUnavailable
from .java import JavaExecutor
from .python_executor import PythonExecutor

EXECUTORS: Dict[str, Type[Executor]] = {
    "python": PythonExecutor,
    "java": JavaExecutor,
    "cpp": CppExecutor,
}


class UnsupportedLanguage(ValueError):
    pass


def get_executor(language: str, sandbox: Optional[DockerSandbox] = None) -> Executor:
    try:
        return EXECUTORS[(language or "").strip().lower()](sandbox)
    except KeyError:
        raise UnsupportedLanguage(f"Unsupported language: {language!r}") from None


__all__ = [
    "EXECUTORS", "CppExecutor", "DockerSandbox", "ExecutionResult", "Executor", "JavaExecutor",
    "PythonExecutor", "SandboxLimits", "SandboxUnavailable", "UnsupportedLanguage", "get_executor",
]
