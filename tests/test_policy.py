from __future__ import annotations

from backend.models import (
    DamageAssessment, Decision, Discrepancy, DiscrepancyType,
    PolicyConfig, Severity,
)
from backend.policy import evaluate_discrepancy


def test_wrong_item_escalates():
    disc = Discrepancy(type=DiscrepancyType.WRONG_ITEM)
    result = evaluate_discrepancy(disc, None, "TestVendor", "PO-001")
    assert result.decision == Decision.ESCALATE
    assert "wrong" in result.reason.lower() or "Wrong" in result.reason


def test_overage_auto_accepts():
    disc = Discrepancy(type=DiscrepancyType.OVERAGE, expected_qty=50, actual_qty=55)
    result = evaluate_discrepancy(disc, None, "TestVendor", "PO-001")
    assert result.decision == Decision.AUTO_ACCEPT


def test_small_shortage_auto_accepts():
    """1% shortage (1 out of 100) should be auto-accepted."""
    disc = Discrepancy(type=DiscrepancyType.SHORTAGE, expected_qty=100, actual_qty=99)
    result = evaluate_discrepancy(disc, None, "TestVendor", "PO-001")
    assert result.decision == Decision.AUTO_ACCEPT
    assert "tolerance" in result.reason.lower() or "within" in result.reason.lower()


def test_large_shortage_escalates():
    """10% shortage should escalate."""
    disc = Discrepancy(type=DiscrepancyType.SHORTAGE, expected_qty=100, actual_qty=90)
    result = evaluate_discrepancy(disc, None, "TestVendor", "PO-001")
    assert result.decision == Decision.ESCALATE


def test_damage_no_assessment_escalates():
    disc = Discrepancy(type=DiscrepancyType.DAMAGE, total_value_eur=50)
    result = evaluate_discrepancy(disc, None, "TestVendor", "PO-001")
    assert result.decision == Decision.ESCALATE
    assert "unavailable" in result.reason.lower() or "manual" in result.reason.lower()


def test_damage_low_confidence_escalates():
    disc = Discrepancy(type=DiscrepancyType.DAMAGE, total_value_eur=50)
    assessment = DamageAssessment(
        item="Bolts", severity=Severity.LOW, affected_quantity=2,
        confidence=0.5, description="Minor dents", claim_sentence="Claim for dents",
    )
    result = evaluate_discrepancy(disc, assessment, "TestVendor", "PO-001")
    assert result.decision == Decision.ESCALATE
    assert "confidence" in result.reason.lower()


def test_damage_high_severity_escalates():
    disc = Discrepancy(type=DiscrepancyType.DAMAGE, total_value_eur=50)
    assessment = DamageAssessment(
        item="Bolts", severity=Severity.HIGH, affected_quantity=10,
        confidence=0.9, description="Completely crushed", claim_sentence="Claim",
    )
    result = evaluate_discrepancy(disc, assessment, "TestVendor", "PO-001")
    assert result.decision == Decision.ESCALATE
    assert "high" in result.reason.lower() or "severity" in result.reason.lower()


def test_low_value_damage_auto_accepts_with_claim():
    disc = Discrepancy(type=DiscrepancyType.DAMAGE, total_value_eur=50)
    assessment = DamageAssessment(
        item="M8 Bolts", severity=Severity.LOW, affected_quantity=2,
        confidence=0.85, description="Minor dents on 2 cartons",
        claim_sentence="Two cartons showed minor denting on arrival.",
    )
    result = evaluate_discrepancy(disc, assessment, "Stahl GmbH", "PO-4500001")
    assert result.decision == Decision.AUTO_ACCEPT_WITH_CLAIM
    assert result.claim is not None
    assert result.claim.vendor_name == "Stahl GmbH"
    assert result.claim.po_number == "PO-4500001"
    assert result.claim.claimed_amount_eur == 50
    assert "Stahl GmbH" in result.claim.draft_email


def test_high_value_damage_escalates():
    disc = Discrepancy(type=DiscrepancyType.DAMAGE, total_value_eur=500)
    assessment = DamageAssessment(
        item="Bearings", severity=Severity.MEDIUM, affected_quantity=5,
        confidence=0.9, description="Cracked housings",
        claim_sentence="Bearing housings cracked.",
    )
    result = evaluate_discrepancy(disc, assessment, "TestVendor", "PO-001")
    assert result.decision == Decision.ESCALATE
    assert "exceeds" in result.reason.lower()


def test_custom_policy_thresholds():
    """Custom policy with higher damage threshold."""
    policy = PolicyConfig(damage_auto_accept_eur=1000.0, shortage_auto_accept_pct=0.05)

    # 500 EUR damage should now auto-accept
    disc = Discrepancy(type=DiscrepancyType.DAMAGE, total_value_eur=500)
    assessment = DamageAssessment(
        item="Bearings", severity=Severity.MEDIUM, affected_quantity=5,
        confidence=0.9, description="Cracked", claim_sentence="Claim",
    )
    result = evaluate_discrepancy(disc, assessment, "TestVendor", "PO-001", policy)
    assert result.decision == Decision.AUTO_ACCEPT_WITH_CLAIM

    # 4% shortage should now auto-accept
    disc2 = Discrepancy(type=DiscrepancyType.SHORTAGE, expected_qty=100, actual_qty=96)
    result2 = evaluate_discrepancy(disc2, None, "TestVendor", "PO-001", policy)
    assert result2.decision == Decision.AUTO_ACCEPT


def test_boundary_shortage_at_threshold():
    """Exactly 2% shortage should auto-accept (<=)."""
    disc = Discrepancy(type=DiscrepancyType.SHORTAGE, expected_qty=100, actual_qty=98)
    result = evaluate_discrepancy(disc, None, "TestVendor", "PO-001")
    assert result.decision == Decision.AUTO_ACCEPT


def test_boundary_damage_at_threshold():
    """Exactly 100 EUR damage should auto-accept with claim (<=)."""
    disc = Discrepancy(type=DiscrepancyType.DAMAGE, total_value_eur=100.0)
    assessment = DamageAssessment(
        item="Bolts", severity=Severity.LOW, affected_quantity=1,
        confidence=0.8, description="Minor", claim_sentence="Claim",
    )
    result = evaluate_discrepancy(disc, assessment, "TestVendor", "PO-001")
    assert result.decision == Decision.AUTO_ACCEPT_WITH_CLAIM
