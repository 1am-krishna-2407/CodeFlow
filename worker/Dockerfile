FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1
WORKDIR /usr/src/worker

COPY pyproject.toml ./
RUN mkdir worker && touch worker/__init__.py && pip install --upgrade pip && pip install . && pip uninstall -y codeflow-worker && rm -rf worker build *.egg-info

COPY worker ./worker

# The worker reaches Docker over TCP through the socket proxy, so it needs no socket access or root.
RUN useradd --create-home --uid 10002 worker
USER worker

CMD ["python", "-m", "worker.main"]
