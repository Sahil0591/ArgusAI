"""Standalone Pydantic integration test for ArgusAI models.

Run:  python test_pydantic.py
"""

from __future__ import annotations

import json
import sys
from datetime import UTC, date, datetime

from pydantic import ValidationError

from backend.models import (
    DamageAssessment,
    Decision,
    Delivery,
    DeliveryStatus,
    Discrepancy,
    DiscrepancyType,
    Escalation,
    Event,
    EventType,
    GoodsReceiptDocument,
    GRLine,
    PolicyConfig,
    PolicyDecision,
    PurchaseOrder,
    QualityNotification,
    ReceiptLine,
    Severity,
    SpokenLine,
    SupplierClaim,
)

passed = 0
failed = 0


def check(name: str, fn):
    global passed, failed
    try:
        fn()
        print(f"  PASS  {name}")
        passed += 1
    except Exception as exc:
        print(f"  FAIL  {name}: {exc}")
        failed += 1


# ---------------------------------------------------------------
# 1. Basic model creation & serialization
# ---------------------------------------------------------------

def test_spoken_line():
    line = SpokenLine(
        delivery_id="DEL-001",
        pallet_number=1,
        material_description="Steel bolts M10x50",
        quantity=200,
        unit_of_measure="PC",
        raw_transcript="two hundred steel bolts m ten by fifty",
    )
    d = line.model_dump()
    assert d["delivery_id"] == "DEL-001"
    assert d["quantity"] == 200
    reparsed = SpokenLine.model_validate(d)
    assert reparsed == line


def test_spoken_line_coercion():
    """Quantity passed as string should coerce to float."""
    line = SpokenLine.model_validate({
        "delivery_id": "D-PYDANTIC",
        "material_description": "M8 bolts",
        "quantity": "24",
        "raw_transcript": "twenty four cartons of M8 bolts",
    })
    assert line.quantity == 24.0
    assert line.unit_of_measure == "CTN"


def test_discrepancy_defaults():
    disc = Discrepancy(type=DiscrepancyType.SHORTAGE, expected_qty=100, actual_qty=95)
    assert disc.id  # UUID auto-generated
    assert disc.unit_value_eur == 0.0
    assert disc.photo_id is None


def test_receipt_line_with_discrepancies():
    disc = Discrepancy(type=DiscrepancyType.DAMAGE, damage_description="Dented casing")
    rl = ReceiptLine(
        delivery_id="DEL-001",
        po_number="PO-4500001234",
        po_line="00010",
        material_number="MAT-001",
        material_description="Hydraulic pump",
        ordered_qty=10,
        received_qty=10,
        unit_of_measure="PC",
        discrepancies=[disc],
    )
    j = rl.model_dump_json()
    parsed = ReceiptLine.model_validate_json(j)
    assert len(parsed.discrepancies) == 1
    assert parsed.discrepancies[0].type == DiscrepancyType.DAMAGE


# ---------------------------------------------------------------
# 2. Damage assessment & policy engine models
# ---------------------------------------------------------------

def test_damage_assessment():
    da = DamageAssessment(
        item="Hydraulic pump",
        severity=Severity.HIGH,
        affected_quantity=3,
        confidence=0.92,
        description="Visible cracks on pump housing",
        claim_sentence="3 units of Hydraulic pump show high-severity cracks.",
    )
    assert da.confidence == 0.92
    d = da.model_dump(mode="json")
    assert d["severity"] == "high"


def test_damage_assessment_confidence_bounds():
    """confidence must be between 0 and 1."""
    try:
        DamageAssessment(
            item="x", severity=Severity.LOW, affected_quantity=1,
            confidence=1.5, description="x", claim_sentence="x",
        )
        raise AssertionError("Should have raised ValidationError")
    except ValidationError as exc:
        assert exc.errors()[0]["loc"] == ("confidence",)


def test_policy_config_defaults():
    pc = PolicyConfig()
    assert pc.shortage_auto_accept_pct == 0.02
    assert pc.damage_auto_accept_eur == 100.0
    assert pc.vision_confidence_threshold == 0.7


def test_policy_decision_with_claim():
    claim = SupplierClaim(
        vendor_name="Bosch Rexroth",
        po_number="PO-4500001234",
        material="Hydraulic pump",
        damage_description="Cracked housing on 3 units",
        claimed_amount_eur=1500.0,
        draft_email="Dear Bosch Rexroth, we report damage...",
    )
    pd = PolicyDecision(
        decision=Decision.AUTO_ACCEPT_WITH_CLAIM,
        reason="Damage value EUR 1500 exceeds auto-accept threshold",
        claim=claim,
    )
    j = json.loads(pd.model_dump_json())
    assert j["decision"] == "auto_accept_with_claim"
    assert j["claim"]["claimed_amount_eur"] == 1500.0


def test_policy_decision_no_claim():
    pd = PolicyDecision(
        decision=Decision.AUTO_ACCEPT,
        reason="Shortage within 2% tolerance",
    )
    assert pd.claim is None


# ---------------------------------------------------------------
# 3. SAP export models
# ---------------------------------------------------------------

def test_goods_receipt_document():
    gr = GoodsReceiptDocument(
        BLDAT=date(2026, 9, 19),
        BUDAT=date(2026, 9, 19),
        lines=[
            GRLine(
                EBELN="4500001234", EBELP="00010", MATNR="MAT-001",
                MAKTX="Hydraulic pump", MENGE=10.0, MEINS="PC",
            ),
        ],
    )
    assert gr.lines[0].BWART == "101"
    d = gr.model_dump(mode="json")
    assert d["lines"][0]["BWART"] == "101"


def test_quality_notification():
    qn = QualityNotification(
        MATNR="MAT-001", vendor="V-1000", description="Cracked housing",
        decision="escalate", photos=["photo-abc.jpg"],
    )
    assert qn.QMTYP == "Q1"


# ---------------------------------------------------------------
# 4. Event and entity models
# ---------------------------------------------------------------

def test_event():
    ev = Event(
        delivery_id="DEL-001",
        type=EventType.LINE_LOGGED,
        data={"material": "MAT-001", "qty": 100},
    )
    assert ev.id is None  # set by DB
    assert ev.needs_review is False
    assert isinstance(ev.timestamp, datetime)


def test_delivery():
    d = Delivery(id="DEL-001", po_number="PO-123", vendor_id="V-1000")
    assert d.status == DeliveryStatus.IN_PROGRESS
    assert d.completed_at is None


def test_escalation():
    esc = Escalation(delivery_id="DEL-001", discrepancy_id="DISC-001")
    assert esc.id  # UUID auto-generated
    assert esc.status.value == "pending"


# ---------------------------------------------------------------
# 5. Purchase order (seed data model)
# ---------------------------------------------------------------

def test_purchase_order():
    po = PurchaseOrder.model_validate({
        "EBELN": "4500001234",
        "LIFNR": "V-1000",
        "BEDAT": "2026-09-01",
        "lines": [
            {"EBELP": "00010", "MATNR": "MAT-001", "MAKTX": "Pump",
             "MENGE": 50, "MEINS": "PC", "NETPR": 250.0},
        ],
    })
    assert po.lines[0].NETPR == 250.0


# ---------------------------------------------------------------
# 6. Validation error handling
# ---------------------------------------------------------------

def test_missing_required_field():
    """SpokenLine without delivery_id should fail."""
    try:
        SpokenLine(material_description="bolts", quantity=10)
        raise AssertionError("Should have raised ValidationError")
    except ValidationError as e:
        assert "delivery_id" in str(e)


def test_invalid_enum():
    """Invalid DiscrepancyType should fail."""
    try:
        Discrepancy(type="nonexistent")
        raise AssertionError("Should have raised ValidationError")
    except ValidationError:
        pass


def test_round_trip_json():
    """Full round-trip: model -> JSON string -> model."""
    da = DamageAssessment(
        item="Sensor", severity=Severity.MEDIUM, affected_quantity=2,
        confidence=0.85, description="Scratched lens", claim_sentence="2 sensors scratched.",
    )
    json_str = da.model_dump_json()
    restored = DamageAssessment.model_validate_json(json_str)
    assert restored == da


# ---------------------------------------------------------------
# Run all tests
# ---------------------------------------------------------------

if __name__ == "__main__":
    print("ArgusAI Pydantic integration tests\n")

    tests = [
        ("SpokenLine creation & serialization", test_spoken_line),
        ("SpokenLine string-to-float coercion", test_spoken_line_coercion),
        ("Discrepancy default fields", test_discrepancy_defaults),
        ("ReceiptLine with nested discrepancies", test_receipt_line_with_discrepancies),
        ("DamageAssessment creation", test_damage_assessment),
        ("DamageAssessment confidence bounds", test_damage_assessment_confidence_bounds),
        ("PolicyConfig defaults", test_policy_config_defaults),
        ("PolicyDecision with SupplierClaim", test_policy_decision_with_claim),
        ("PolicyDecision without claim", test_policy_decision_no_claim),
        ("GoodsReceiptDocument (SAP GR)", test_goods_receipt_document),
        ("QualityNotification (SAP QN)", test_quality_notification),
        ("Event model", test_event),
        ("Delivery model", test_delivery),
        ("Escalation model", test_escalation),
        ("PurchaseOrder seed model", test_purchase_order),
        ("Missing required field error", test_missing_required_field),
        ("Invalid enum error", test_invalid_enum),
        ("JSON round-trip", test_round_trip_json),
    ]

    for name, fn in tests:
        check(name, fn)

    print(f"\n{'='*50}")
    print(f"Results: {passed} passed, {failed} failed out of {passed + failed}")
    print(f"{'='*50}")
    sys.exit(1 if failed else 0)
