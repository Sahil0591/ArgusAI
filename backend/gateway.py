"""Model provider for ArgusAI — always uses Google directly."""

from __future__ import annotations

import os
from backend import config


def get_model(model_name: str | None = None) -> str:
    os.environ.setdefault("GOOGLE_API_KEY", config.GEMINI_API_KEY)
    return f"google:{model_name or config.GEMINI_VISION_MODEL}"
