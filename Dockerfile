FROM python:3.12-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen --no-install-project

COPY . .

CMD ["sh", "-c", "uv run uvicorn backend.app:app --host 0.0.0.0 --port ${PORT:-8000}"]
