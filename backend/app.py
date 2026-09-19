from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import logfire
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import config


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    print("[ArgusAI] startup")
    yield
    print("[ArgusAI] shutdown")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(title="ArgusAI", version="0.1.0", lifespan=lifespan)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Logfire instrumentation — optional; skipped when token is absent
try:
    if config.LOGFIRE_TOKEN:
        logfire.configure(token=config.LOGFIRE_TOKEN)
    else:
        logfire.configure(send_to_logfire=False)
    logfire.instrument_fastapi(app)
except Exception as exc:  # noqa: BLE001
    print(f"[ArgusAI] logfire instrumentation skipped: {exc}")


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "version": "0.1.0"}
