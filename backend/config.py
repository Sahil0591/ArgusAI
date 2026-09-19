from __future__ import annotations

import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent


def _load_env_file(path: Path) -> None:
    """Load simple KEY=VALUE lines without requiring python-dotenv."""
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


_load_env_file(BACKEND_DIR / ".env")
_load_env_file(PROJECT_ROOT / ".env")

# ---------------------------------------------------------------------------
# Application settings — loaded from environment variables at import time.
# ---------------------------------------------------------------------------

GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

LOGFIRE_TOKEN: str | None = os.getenv("LOGFIRE_TOKEN", None)

CORS_ORIGINS: list[str] = [
    origin.strip()
    for origin in os.getenv(
        "CORS_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,https://argusxai.vercel.app",
    ).split(",")
    if origin.strip()
]

LOCAL_DATABASE_URL = "sqlite:///./backend/app.db"
MODAL_SQLITE_DATABASE_URL = "sqlite:////data/argusai.db"

DATABASE_URL: str | None = os.getenv("DATABASE_URL")

# Backwards-compatible fallback for older local .env files.
DB_PATH: str | None = os.getenv("DB_PATH")

GEMINI_LIVE_MODEL: str = os.getenv("GEMINI_LIVE_MODEL", "gemini-3.8-live")

GEMINI_VISION_MODEL: str = os.getenv("GEMINI_VISION_MODEL", "gemini-3.6-flash")


def database_url_for_runtime(*, modal_volume_available: bool = False) -> str:
    """Resolve the database connection string for local and Modal runtimes."""
    if DATABASE_URL:
        return DATABASE_URL
    if DB_PATH:
        return f"sqlite:///{DB_PATH}"
    if modal_volume_available:
        return MODAL_SQLITE_DATABASE_URL
    return LOCAL_DATABASE_URL
