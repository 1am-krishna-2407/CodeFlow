from .base import Executor


class CppExecutor(Executor):
    language = "cpp"
    default_image = "gcc:13"
    filename = "main.cpp"
    compile_command = "g++ -std=c++17 -O2 -pipe -o main main.cpp"
    run_command = "./main"
    default_memory = "256m"  # g++ itself needs headroom to compile <iostream>-heavy code
