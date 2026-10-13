"""End-to-end sandbox tests against a real Docker daemon. Skipped automatically when none is available.

The first run pulls python:3.11-slim, eclipse-temurin:17-jdk and gcc:13, which takes a while.
"""
import pytest

from worker.executors import CppExecutor, JavaExecutor, PythonExecutor

pytestmark = pytest.mark.docker


def test_python_hello_and_stdin():
    result = PythonExecutor().execute("name = input()\nprint(f'hello {name}')", stdin="codeflow\n", timeout=20)
    assert result.exit_code == 0, result.stderr
    assert result.stdout == "hello codeflow\n"


def test_python_error_exit_code():
    result = PythonExecutor().execute('raise ValueError("Sample Error")', timeout=20)
    assert result.exit_code != 0
    assert "Sample Error" in result.stderr


def test_python_timeout():
    result = PythonExecutor().execute("print('start', flush=True)\nwhile True: pass", timeout=3)
    assert result.timed_out
    assert "start" in result.stdout


def test_network_is_disabled():
    code = "import socket\nsocket.create_connection(('1.1.1.1', 53), timeout=2)"
    assert PythonExecutor().execute(code, timeout=20).exit_code != 0


def test_root_filesystem_is_read_only_and_user_is_unprivileged():
    code = "import os\nprint(os.getuid())\nopen('/etc/pwned', 'w')"
    result = PythonExecutor().execute(code, timeout=20)
    assert result.stdout.strip() == "65534"
    assert result.exit_code != 0


def test_fork_bomb_is_contained():
    code = "import os\nwhile True:\n    try:\n        os.fork()\n    except OSError:\n        print('limited', flush=True); break"
    result = PythonExecutor().execute(code, timeout=10)
    assert "limited" in result.stdout or result.timed_out


def test_java():
    code = 'public class Main { public static void main(String[] a) { System.out.println("Test Java " + new java.util.Scanner(System.in).nextInt()); } }'
    result = JavaExecutor().execute(code, stdin="17", timeout=30)
    assert result.exit_code == 0, result.stderr
    assert result.stdout.strip() == "Test Java 17"


def test_cpp_and_compile_errors():
    ok = CppExecutor().execute('#include <iostream>\nint main(){std::cout<<"Test CPP"<<std::endl;}', timeout=30)
    assert ok.exit_code == 0, ok.stderr
    assert ok.stdout == "Test CPP\n"

    assert ok.compile_time is not None and ok.duration is not None

    broken = CppExecutor().execute("int main() { return }", timeout=30)
    assert broken.exit_code != 0
    assert "error" in broken.stderr
    assert broken.compile_time is not None and broken.duration is None  # never ran
    assert "@@cf-" not in broken.stderr
