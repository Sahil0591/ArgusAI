from __future__ import annotations

import json
from pathlib import Path

from backend.models import (
    DamageAssessment, Delivery, Discrepancy, DiscrepancyType,
    Event, EventType, GoodsReceiptDocument, GRLine, Material,
    PolicyConfig, PolicyDecision, Decision, PurchaseOrder,
    QualityNotification, ReceiptLine, Severity, SpokenLine,
    SupplierClaim, Vendor,
)
from datetime import date


SEED_DIR = Path(__file__).parent.parent / "backend" / "seed"


def test_vendor_from_seed():
    data = json.loads((SEED_DIR / "vendors.json").read_text())
    vendors = [Vendor(**v) for v in data]
    assert len(vendors) == 3
    assert all(v.LIFNR.startswith("V") for v in vendors)


def test_material_from_seed():
    data = json.loads((SEED_DIR / "materials.json").read_text())
    materials = [Material(**m) for m in data]
    assert len(materials) == 10
    high_value = [m for m in materials if m.NETPR >= 400]
    assert len(high_value) >= 1


def test_purchase_order_from_seed():
    data = json.loads((SEED_DIR / "purchase_orders.json").read_text())
    pos = [PurchaseOrder(**p) for p in data]
    assert len(pos) == 3
    total_lines = sum(len(po.lines) for po in pos)
    assert total_lines == 10


def test_spoken_line_defaults():
    line = SpokenLine(delivery_id="D1", material_description="M8 bolts", quantity=20)
    assert line.unit_of_measure == "CTN"
    assert line.pallet_number is None
    assert line.damage_noted is None


def test_discrepancy_auto_id():
    d = Discrepancy(type=DiscrepancyType.SHORTAGE, expected_qty=50, actual_qty=48, unit_value_eur=18.50)
    assert d.id  # auto-generated uuid
    assert d.total_value_eur == 0.0  # default, calculated by policy engine


def test_damage_assessment_confidence_bounds():
    a = DamageAssessment(
        item="M8 bolts", severity=Severity.LOW,
        affected_quantity=2, confidence=0.85,
        description="Minor dents", claim_sentence="Claim for dents",
    )
    assert 0 <= a.confidence <= 1

    # Test out-of-bounds
    import pytest
    with pytest.raises(Exception):
        DamageAssessment(
            item="x", severity=Severity.LOW, affected_quantity=1,
            confidence=1.5, description="x", claim_sentence="x",
        )


def test_policy_config_defaults():
    cfg = PolicyConfig()
    assert cfg.shortage_auto_accept_pct == 0.02
    assert cfg.damage_auto_accept_eur == 100.0
    assert cfg.vision_confidence_threshold == 0.7


def test_policy_decision_with_claim():
    claim = SupplierClaim(
        vendor_name="Test GmbH", po_number="PO-001",
        material="bolts", damage_description="crushed",
        claimed_amount_eur=50.0, draft_email="Dear vendor...",
    )
    decision = PolicyDecision(
        decision=Decision.AUTO_ACCEPT_WITH_CLAIM,
        reason="Damage below threshold", claim=claim,
    )
    assert decision.claim is not None
    assert decision.claim.claimed_amount_eur == 50.0


def test_goods_receipt_document():
    gr = GoodsReceiptDocument(
        BLDAT=date(2026, 9, 19), BUDAT=date(2026, 9, 19),
        lines=[GRLine(EBELN="PO-001", EBELP="10", MATNR="MAT-001",
                       MAKTX="Bolts", MENGE=50, MEINS="CTN")],
    )
    assert gr.lines[0].BWART == "101"
    assert len(gr.lines) == 1


def test_event_defaults():
    e = Event(delivery_id="D1", type=EventType.LINE_LOGGED, data={"qty": 50})
    assert e.needs_review is False
    assert e.id is None
    assert e.timestamp is not None
