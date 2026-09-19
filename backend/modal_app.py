from __future__ import annotations
import os
import modal

app = modal.App("argusai")

# The volume remains useful for SQLite fallback and uploaded photo files.
# Production DB state should come from DATABASE_URL in the Modal secret.
volume = modal.Volume.from_name("argusai-data", create_if_missing=True)

secret_name = os.getenv("ARGUSAI_MODAL_SECRET_NAME", "argusai-secrets")
secret_mode = os.getenv("ARGUSAI_MODAL_SECRET_MODE", "name").lower()
runtime_secret = (
    modal.Secret.from_dotenv(__file__)
    if secret_mode in {"dotenv", "local"}
    else modal.Secret.from_name(secret_name)
)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi>=0.141.1",
        "google-genai>=2.24.0",
        "logfire[fastapi]>=5.1.0",
        "psycopg[binary]>=3.3.2",
        "pydantic-ai-slim[google]>=2.45.0",
        "uvicorn>=0.53.0",
        "python-multipart>=0.0.32",
    )
    .env({"PYTHONPATH": "/app"})
    .add_local_dir("backend", remote_path="/app/backend")
)

@app.function(
    image=image,
    volumes={"/data": volume},
    secrets=[runtime_secret],
    min_containers=1,
    max_containers=1,
    timeout=3600,
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def web():
    from backend.app import app as fastapi_app
    return fastapi_app
