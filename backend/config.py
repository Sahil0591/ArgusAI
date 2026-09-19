from __future__ import annotations

import os

# ---------------------------------------------------------------------------
# Application settings — loaded from environment variables at import time.
# ---------------------------------------------------------------------------

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

LOGFIRE_TOKEN: str | None = os.getenv("LOGFIRE_TOKEN", None)

CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]

DB_PATH: str = os.getenv("DB_PATH", "argusai.db")

GEMINI_LIVE_MODEL: str = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.8-live")

GEMINI_VISION_MODEL: str = os.getenv("GEMINI_VISION_MODEL", "gemini-3.6-flash")
