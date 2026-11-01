FROM python:3.14-slim

WORKDIR /app
COPY pyproject.toml uv.lock ./
COPY src/ ./src/
RUN pip install --no-cache-dir uv && uv sync --frozen --no-dev

RUN useradd -m appuser && chown -R appuser /app
USER appuser

# ponytail: keep-alive placeholder — replace when the backend becomes a long-running service
CMD ["sh", "-c", "uv run python -m backend && tail -f /dev/null"]
