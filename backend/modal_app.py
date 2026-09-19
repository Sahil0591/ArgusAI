from __future__ import annotations
import modal

app = modal.App("argusai")

volume = modal.Volume.from_name("argusai-data", create_if_missing=True)

image = (
    modal.Image.debian_slim(python_version="3.12")
    .pip_install(
        "fastapi>=0.141.1",
        "google-genai>=2.24.0",
        "logfire[fastapi]>=5.1.0",
        "pydantic-ai-slim[google]>=2.45.0",
        "uvicorn>=0.53.0",
    )
    .env({"PYTHONPATH": "/app"})
    .add_local_dir("backend", remote_path="/app/backend")
)

@app.function(
    image=image,
    volumes={"/data": volume},
    secrets=[modal.Secret.from_name("argusai-secrets")],
    min_containers=1,
    max_containers=1,
    timeout=3600,
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def web():
    from backend.app import app as fastapi_app
    return fastapi_app
