from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncGenerator

import logfire
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend import config
from backend.routes import router


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    import os
    from backend.store import Store
    from backend.services import DeliveryService
    from backend import routes

    # Use /data/ on Modal (Volume), local path otherwise
    db_path = "/data/argusai.db" if os.path.isdir("/data") else config.DB_PATH
    store = Store(db_path)
    store.init_db()
    service = DeliveryService(store)
    routes.set_dependencies(service, store)
    print(f"[ArgusAI] startup - db: {db_path}")
    yield
    store.close()
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

app.include_router(router)

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
