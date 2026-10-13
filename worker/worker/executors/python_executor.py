from .base import Executor


class PythonExecutor(Executor):
    language = "python"
    default_image = "python:3.11-slim"
    filename = "main.py"
    run_command = "python3 main.py"
