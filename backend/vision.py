from __future__ import annotations

import os
import traceback

from pydantic_ai import Agent
from pydantic_ai.messages import BinaryContent

from backend import config
from backend.models import DamageAssessment


def _make_agent() -> Agent[None, DamageAssessment]:
    """Create vision agent. Deferred so missing API key doesn't crash import."""
    # pydantic-ai's google provider reads GOOGLE_API_KEY
    os.environ.setdefault("GOOGLE_API_KEY", config.GEMINI_API_KEY)
    return Agent(
        f"google:{config.GEMINI_VISION_MODEL}",
        output_type=DamageAssessment,
        system_prompt=(
            "You are a warehouse damage assessment expert. "
            "You are given a photo of damaged goods and the material description. "
            "Assess the damage and return a structured assessment. "
            "Be specific about the type and extent of damage. "
            "Set confidence between 0 and 1 based on image clarity and certainty. "
            "Write a claim_sentence suitable for a supplier claim email."
        ),
    )


async def assess_damage(
    image_bytes: bytes,
    material_description: str,
    po_context: str = "",
    content_type: str = "image/jpeg",
) -> DamageAssessment | None:
    """
    Run vision agent on a damage photo.
    Returns DamageAssessment on success, None on failure (caller should escalate).
    """
    try:
        agent = _make_agent()

        prompt = f"Material: {material_description}"
        if po_context:
            prompt += f"\nPO context: {po_context}"
        prompt += "\n\nAssess the damage visible in this photo."

        result = await agent.run(
            [
                prompt,
                BinaryContent(data=image_bytes, media_type=content_type),
            ]
        )
        return result.output

    except Exception as exc:
        print(f"[ArgusAI] Vision assessment failed: {exc}")
        traceback.print_exc()
        return None
