from .base import Executor

# Serial GC and C1-only JIT keep both javac and the program's JVM small and quick to start.
_JVM_FLAGS = "-XX:+UseSerialGC -XX:TieredStopAtLevel=1"


class JavaExecutor(Executor):
    language = "java"
    default_image = "eclipse-temurin:17-jdk"
    filename = "Main.java"  # the submitted code must declare `public class Main`
    compile_command = f"javac -J{_JVM_FLAGS.replace(' ', ' -J')} -d . Main.java"
    run_command = f"java {_JVM_FLAGS} -cp . Main"
    default_memory = "256m"
    pids = 128  # JVM threads count against the pid limit
