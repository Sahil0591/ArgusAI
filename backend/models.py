from __future__ import annotations

import enum
import uuid
from datetime import UTC, date, datetime
from typing import Any

from pydantic import BaseModel, Field


# --- Enums ---

class DiscrepancyType(str, enum.Enum):
    SHORTAGE = "shortage"
    OVERAGE = "overage"
    WRONG_ITEM = "wrong_item"
    DAMAGE = "damage"


class Severity(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"


class Decision(str, enum.Enum):
    AUTO_ACCEPT = "auto_accept"
    AUTO_ACCEPT_WITH_CLAIM = "auto_accept_with_claim"
    ESCALATE = "escalate"


class EscalationStatus(str, enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REJECTED = "rejected"


class DeliveryStatus(str, enum.Enum):
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"


class EventType(str, enum.Enum):
    LINE_LOGGED = "line_logged"
    DAMAGE_REPORTED = "damage_reported"
    PHOTO_UPLOADED = "photo_uploaded"
    ASSESSMENT_COMPLETE = "assessment_complete"
    POLICY_DECISION = "policy_decision"
    ESCALATION_CREATED = "escalation_created"
    ESCALATION_DECIDED = "escalation_decided"
    DELIVERY_CLOSED = "delivery_closed"


# --- Seed / SAP data ---

class Vendor(BaseModel):
    LIFNR: str  # vendor number
    NAME1: str  # vendor name
    LAND1: str  # country

class Material(BaseModel):
    MATNR: str  # material number
    MAKTX: str  # description
    MEINS: str  # unit of measure
    NETPR: float  # unit price EUR

class POLine(BaseModel):
    EBELP: str  # line item number
    MATNR: str
    MAKTX: str
    MENGE: float  # ordered quantity
    MEINS: str
    NETPR: float

class PurchaseOrder(BaseModel):
    EBELN: str  # PO number
    LIFNR: str  # vendor
    BEDAT: str  # order date (ISO string)
    lines: list[POLine]


# --- Core domain ---

class SpokenLine(BaseModel):
    delivery_id: str
    pallet_number: int | None = None
    material_description: str
    quantity: float
    unit_of_measure: str = "CTN"
    damage_noted: str | None = None
    line_status: str = "received"  # received or missing
    tool_call_id: str | None = None
    raw_transcript: str = ""


class Discrepancy(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: DiscrepancyType
    expected_qty: float | None = None
    actual_qty: float | None = None
    damage_description: str | None = None
    unit_value_eur: float = 0.0
    total_value_eur: float = 0.0
    photo_id: str | None = None


class ReceiptLine(BaseModel):
    delivery_id: str
    po_number: str
    po_line: str
    material_number: str
    material_description: str
    ordered_qty: float
    received_qty: float
    unit_of_measure: str
    discrepancies: list[Discrepancy] = Field(default_factory=list)


class DamageAssessment(BaseModel):
    """Output type for the Gemini vision agent."""
    item: str
    severity: Severity
    affected_quantity: int
    confidence: float = Field(ge=0.0, le=1.0)
    description: str
    claim_sentence: str


class PolicyConfig(BaseModel):
    shortage_auto_accept_pct: float = 0.02
    damage_auto_accept_eur: float = 100.0
    vision_confidence_threshold: float = 0.7


class SupplierClaim(BaseModel):
    vendor_name: str
    po_number: str
    material: str
    damage_description: str
    claimed_amount_eur: float
    draft_email: str


class PolicyDecision(BaseModel):
    decision: Decision
    reason: str
    claim: SupplierClaim | None = None


class GRLine(BaseModel):
    """Single line in a goods receipt document (SAP movement type 101)."""
    EBELN: str   # PO number
    EBELP: str   # PO item
    MATNR: str   # material number
    MAKTX: str   # material description
    MENGE: float  # received quantity
    MEINS: str   # unit of measure
    BWART: str = "101"  # movement type


class GoodsReceiptDocument(BaseModel):
    """SAP-style goods receipt, movement type 101."""
    BLDAT: date  # document date
    BUDAT: date  # posting date
    lines: list[GRLine] = Field(default_factory=list)


class QualityNotification(BaseModel):
    """SAP-style quality notification for damage/discrepancy."""
    QMTYP: str = "Q1"  # complaint
    MATNR: str
    vendor: str
    description: str
    damage_assessment: DamageAssessment | None = None
    decision: str
    photos: list[str] = Field(default_factory=list)


# --- Events and entities ---

class Event(BaseModel):
    id: int | None = None
    delivery_id: str
    timestamp: datetime = Field(default_factory=lambda: datetime.now(UTC))
    type: EventType
    data: dict[str, Any] = Field(default_factory=dict)
    needs_review: bool = False


class Delivery(BaseModel):
    id: str
    po_number: str
    vendor_id: str
    status: DeliveryStatus = DeliveryStatus.IN_PROGRESS
    started_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
    completed_at: datetime | None = None


class Escalation(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    delivery_id: str
    discrepancy_id: str
    status: EscalationStatus = EscalationStatus.PENDING
    decided_at: datetime | None = None
    decided_by: str | None = None


class Photo(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    delivery_id: str
    discrepancy_id: str
    filename: str
    content_type: str = "image/jpeg"
    data: bytes | None = None
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(UTC))
