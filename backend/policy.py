from __future__ import annotations

import os

from pydantic_ai import Agent

from backend import config
from backend.models import (
    DamageAssessment, Decision, Discrepancy, DiscrepancyType,
    PolicyConfig, PolicyDecision, SupplierClaim,
)


# Default policy config (can be overridden per-deployment)
DEFAULT_POLICY = PolicyConfig()


def evaluate_discrepancy(
    discrepancy: Discrepancy,
    assessment: DamageAssessment | None,
    vendor_name: str,
    po_number: str,
    policy: PolicyConfig | None = None,
) -> PolicyDecision:
    """
    Deterministic policy evaluation. Rules decide; the LLM only drafts claims.

    Rules:
    - SHORTAGE <= threshold % -> AUTO_ACCEPT
    - OVERAGE -> AUTO_ACCEPT (log it, not a problem)
    - WRONG_ITEM -> ESCALATE always
    - DAMAGE:
      - If assessment confidence < threshold -> ESCALATE
      - If damage value <= EUR threshold -> AUTO_ACCEPT_WITH_CLAIM
      - If damage value > EUR threshold -> ESCALATE
      - If severity HIGH -> ESCALATE
    """
    cfg = policy or DEFAULT_POLICY

    if discrepancy.type == DiscrepancyType.WRONG_ITEM:
        return PolicyDecision(
            decision=Decision.ESCALATE,
            reason=f"Wrong item received. Expected material does not match.",
        )

    if discrepancy.type == DiscrepancyType.OVERAGE:
        return PolicyDecision(
            decision=Decision.AUTO_ACCEPT,
            reason=f"Overage of {(discrepancy.actual_qty or 0) - (discrepancy.expected_qty or 0):.0f} units. Accepted and noted.",
        )

    if discrepancy.type == DiscrepancyType.SHORTAGE:
        expected = discrepancy.expected_qty or 0
        actual = discrepancy.actual_qty or 0
        shortage_pct = (expected - actual) / expected if expected > 0 else 1.0
        if shortage_pct <= cfg.shortage_auto_accept_pct:
            return PolicyDecision(
                decision=Decision.AUTO_ACCEPT,
                reason=f"Shortage of {shortage_pct:.1%} ({expected - actual:.0f} units) is within {cfg.shortage_auto_accept_pct:.0%} tolerance.",
            )
        else:
            return PolicyDecision(
                decision=Decision.ESCALATE,
                reason=f"Shortage of {shortage_pct:.1%} ({expected - actual:.0f} units) exceeds {cfg.shortage_auto_accept_pct:.0%} tolerance.",
            )

    # DAMAGE
    if discrepancy.type == DiscrepancyType.DAMAGE:
        # Low confidence -> escalate
        if assessment and assessment.confidence < cfg.vision_confidence_threshold:
            return PolicyDecision(
                decision=Decision.ESCALATE,
                reason=f"Vision confidence {assessment.confidence:.0%} below {cfg.vision_confidence_threshold:.0%} threshold. Manual review required.",
            )

        # High severity -> escalate
        if assessment and assessment.severity.value == "high":
            return PolicyDecision(
                decision=Decision.ESCALATE,
                reason=f"High severity damage: {assessment.description}. Manual review required.",
            )

        # No assessment (vision failed) -> escalate
        if assessment is None:
            return PolicyDecision(
                decision=Decision.ESCALATE,
                reason="Vision assessment unavailable. Manual review required.",
            )

        # Check value threshold
        damage_value = discrepancy.total_value_eur
        if damage_value <= cfg.damage_auto_accept_eur:
            # Auto-accept with claim - draft the claim synchronously for now
            claim = SupplierClaim(
                vendor_name=vendor_name,
                po_number=po_number,
                material=assessment.item,
                damage_description=assessment.description,
                claimed_amount_eur=damage_value,
                draft_email=_draft_claim_email_sync(
                    vendor_name=vendor_name,
                    po_number=po_number,
                    material=assessment.item,
                    description=assessment.description,
                    claim_sentence=assessment.claim_sentence,
                    amount=damage_value,
                ),
            )
            return PolicyDecision(
                decision=Decision.AUTO_ACCEPT_WITH_CLAIM,
                reason=f"Damage value EUR {damage_value:.2f} within EUR {cfg.damage_auto_accept_eur:.2f} threshold. Supplier claim filed.",
                claim=claim,
            )
        else:
            return PolicyDecision(
                decision=Decision.ESCALATE,
                reason=f"Damage value EUR {damage_value:.2f} exceeds EUR {cfg.damage_auto_accept_eur:.2f} threshold. Manual review required.",
            )

    # Fallback
    return PolicyDecision(
        decision=Decision.ESCALATE,
        reason="Unknown discrepancy type. Escalating for manual review.",
    )


async def evaluate_discrepancy_async(
    discrepancy: Discrepancy,
    assessment: DamageAssessment | None,
    vendor_name: str,
    po_number: str,
    policy: PolicyConfig | None = None,
) -> PolicyDecision:
    """
    Async version that uses the LLM to draft claim emails.
    Falls back to sync drafting if the LLM call fails.
    """
    # First get the deterministic decision
    decision = evaluate_discrepancy(discrepancy, assessment, vendor_name, po_number, policy)

    # If it's auto-accept-with-claim, try to improve the email with LLM
    if decision.decision == Decision.AUTO_ACCEPT_WITH_CLAIM and decision.claim:
        try:
            better_email = await _draft_claim_email_llm(
                vendor_name=vendor_name,
                po_number=po_number,
                material=decision.claim.material,
                description=decision.claim.damage_description,
                claim_sentence=assessment.claim_sentence if assessment else "",
                amount=decision.claim.claimed_amount_eur,
            )
            decision.claim.draft_email = better_email
        except Exception:
            pass  # keep the sync-drafted email

    return decision


def _draft_claim_email_sync(
    vendor_name: str,
    po_number: str,
    material: str,
    description: str,
    claim_sentence: str,
    amount: float,
) -> str:
    """Simple template-based claim email (no LLM needed)."""
    return (
        f"Dear {vendor_name},\n\n"
        f"Re: Purchase Order {po_number}\n\n"
        f"During goods receipt inspection, we identified damage to the following item:\n\n"
        f"  Material: {material}\n"
        f"  Damage: {description}\n"
        f"  {claim_sentence}\n\n"
        f"We are filing a claim for EUR {amount:.2f}.\n\n"
        f"Please confirm receipt of this claim and advise on the next steps.\n\n"
        f"Best regards,\n"
        f"Warehouse Receiving Team"
    )


async def _draft_claim_email_llm(
    vendor_name: str,
    po_number: str,
    material: str,
    description: str,
    claim_sentence: str,
    amount: float,
) -> str:
    """Use Pydantic AI agent to draft a professional claim email."""
    os.environ.setdefault("GOOGLE_API_KEY", config.GEMINI_API_KEY)
    agent = Agent(
        f"google:{config.GEMINI_VISION_MODEL}",
        output_type=str,
        system_prompt=(
            "You are a procurement professional drafting supplier claim emails. "
            "Write a concise, professional email. No placeholders - use the actual data provided. "
            "Keep it under 150 words."
        ),
    )
    result = await agent.run(
        f"Draft a supplier claim email.\n"
        f"Vendor: {vendor_name}\n"
        f"PO: {po_number}\n"
        f"Material: {material}\n"
        f"Damage: {description}\n"
        f"Assessment: {claim_sentence}\n"
        f"Claim amount: EUR {amount:.2f}"
    )
    return result.output
