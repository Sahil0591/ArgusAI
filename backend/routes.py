from __future__ import annotations

import asyncio
import datetime
from datetime import date
import json as json_module
import os
import traceback
import uuid
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel

from backend import config
from backend.models import (
    DamageAssessment,
    Decision,
    Discrepancy,
    DiscrepancyType,
    Escalation,
    Event,
    EventType,
    GoodsReceiptDocument,
    GRLine,
    Photo,
    QualityNotification,
    SpokenLine,
)


router = APIRouter()


# --- Request/Response schemas ---

class StartDeliveryRequest(BaseModel):
    po_number: str

class LogLineRequest(BaseModel):
    delivery_id: str
    pallet_number: int | None = None
    material_description: str
    quantity: float
    unit_of_measure: str = "CTN"
    damage_noted: str | None = None
    line_status: str = "received"
    raw_transcript: str = ""

class ClosePalletRequest(BaseModel):
    delivery_id: str
    pallet_number: int

class ReportDamageRequest(BaseModel):
    delivery_id: str
    material_description: str
    description: str
    quantity: int = 1

class DeliveryStatusRequest(BaseModel):
    delivery_id: str

class EscalationDecisionRequest(BaseModel):
    decision: str  # "accepted" or "rejected"
    decided_by: str = "manager"


# --- Dependency: get service (will be set by app.py lifespan) ---
# These are module-level references set during app startup
_service = None
_store = None

def set_dependencies(service, store):
    global _service, _store
    _service = service
    _store = store

def get_service():
    if _service is None:
        raise HTTPException(status_code=503, detail="Service not initialized")
    return _service

def get_store():
    if _store is None:
        raise HTTPException(status_code=503, detail="Store not initialized")
    return _store


# --- Live API endpoints ---

@router.post("/live/token")
async def live_token():
    """Generate an ephemeral Gemini Live API token."""
    if not config.GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="GEMINI_API_KEY not configured")
    try:
        from google import genai
        client = genai.Client(api_key=config.GEMINI_API_KEY)
        now = datetime.datetime.now(tz=datetime.timezone.utc)
        token = client.auth_tokens.create(
            config={
                "uses": 1,
                "expire_time": now + datetime.timedelta(minutes=30),
                "new_session_expire_time": now + datetime.timedelta(minutes=2),
            }
        )
        return {
            "token": token.name,
            "expires_at": (now + datetime.timedelta(minutes=30)).isoformat(),
            "model": config.GEMINI_LIVE_MODEL,
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to create token: {exc}")


@router.get("/live/tools")
async def live_tools():
    """Return function declarations and system instruction for Gemini Live."""
    system_instruction = (
        "You are ArgusAI, a hands-free voice assistant for warehouse goods receipt. "
        "You help receiving clerks log deliveries against purchase orders. "
        "When the clerk describes items they are receiving, use the log_line tool to record them. "
        "If the clerk says an item is missing, still use log_line immediately with line_status='missing' "
        "and the missing quantity; do not wait for a later received count. "
        "When they mention damage, use report_damage. "
        "When they finish a pallet, use close_pallet. "
        "When they ask about progress, use delivery_status. "
        "Keep your spoken responses short and clear - the clerk is working with their hands. "
        "Always confirm what you logged. If something is unclear, ask for clarification."
    )

    tools = [
        {
            "function_declarations": [
                {
                    "name": "log_line",
                    "description": "Log a received line item against the purchase order. Use when the clerk reports receiving items.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "delivery_id": {"type": "string", "description": "The delivery ID"},
                            "pallet_number": {"type": "integer", "description": "Pallet number if mentioned"},
                            "material_description": {"type": "string", "description": "Description of the material received"},
                            "quantity": {"type": "number", "description": "Number of units received"},
                            "unit_of_measure": {"type": "string", "description": "Unit: CTN (cartons), PC (pieces), PKG (packages)"},
                            "damage_noted": {"type": "string", "description": "Description of any damage if mentioned"},
                            "line_status": {"type": "string", "enum": ["received", "missing"], "description": "Use missing when the clerk says the item is missing; otherwise received"},
                        },
                        "required": ["delivery_id", "material_description", "quantity", "line_status"],
                    },
                },
                {
                    "name": "close_pallet",
                    "description": "Close out a pallet when the clerk is done with it.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "delivery_id": {"type": "string", "description": "The delivery ID"},
                            "pallet_number": {"type": "integer", "description": "The pallet number to close"},
                        },
                        "required": ["delivery_id", "pallet_number"],
                    },
                },
                {
                    "name": "report_damage",
                    "description": "Report damage to items. Use when the clerk specifically reports damage to a material.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "delivery_id": {"type": "string", "description": "The delivery ID"},
                            "material_description": {"type": "string", "description": "Description of the damaged material"},
                            "description": {"type": "string", "description": "Description of the damage"},
                            "quantity": {"type": "integer", "description": "Number of damaged units"},
                        },
                        "required": ["delivery_id", "material_description", "description"],
                    },
                },
                {
                    "name": "delivery_status",
                    "description": "Get the current status and progress of a delivery.",
                    "parameters": {
                        "type": "object",
                        "properties": {
                            "delivery_id": {"type": "string", "description": "The delivery ID"},
                        },
                        "required": ["delivery_id"],
                    },
                },
            ],
        },
    ]

    return {
        "system_instruction": system_instruction,
        "tools": tools,
        "model": config.GEMINI_LIVE_MODEL,
    }


# --- Tool endpoints (called by frontend when Gemini makes function calls) ---

@router.post("/tools/log_line")
async def tool_log_line(req: LogLineRequest):
    service = get_service()
    try:
        spoken = SpokenLine(
            delivery_id=req.delivery_id,
            pallet_number=req.pallet_number,
            material_description=req.material_description,
            quantity=req.quantity,
            unit_of_measure=req.unit_of_measure,
            damage_noted=req.damage_noted,
            line_status=req.line_status,
            raw_transcript=req.raw_transcript,
        )
        return service.log_line(spoken)
    except Exception as exc:
        # Never drop an utterance - log with needs_review
        store = get_store()
        event = Event(
            delivery_id=req.delivery_id,
            type=EventType.LINE_LOGGED,
            data={"raw": req.model_dump(), "error": str(exc), "traceback": traceback.format_exc()},
            needs_review=True,
        )
        store.add_event(event)
        return {
            "speech": "Something went wrong logging that line. I've saved it for review.",
            "error": True,
            "needs_review": True,
        }


@router.post("/tools/close_pallet")
async def tool_close_pallet(req: ClosePalletRequest):
    service = get_service()
    return service.close_pallet(req.delivery_id, req.pallet_number)


@router.post("/tools/report_damage")
async def tool_report_damage(req: ReportDamageRequest):
    service = get_service()
    return service.report_damage(req.delivery_id, req.material_description, req.description, req.quantity)


@router.get("/tools/delivery_status")
async def tool_delivery_status(delivery_id: str):
    service = get_service()
    return service.get_delivery_status(delivery_id)


# --- Delivery management ---

@router.post("/deliveries/{delivery_id}/start")
async def start_delivery(delivery_id: str, req: StartDeliveryRequest):
    service = get_service()
    try:
        delivery = service.start_delivery(delivery_id, req.po_number)
        return {"delivery_id": delivery.id, "po_number": delivery.po_number, "status": delivery.status.value}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/deliveries")
async def list_deliveries():
    store = get_store()
    deliveries = store.list_deliveries()
    return [{"id": d.id, "po_number": d.po_number, "vendor_id": d.vendor_id, "status": d.status.value} for d in deliveries]


@router.get("/deliveries/{delivery_id}")
async def get_delivery(delivery_id: str):
    store = get_store()
    delivery = store.get_delivery(delivery_id)
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    events = store.get_events(delivery_id)
    return {
        "id": delivery.id,
        "po_number": delivery.po_number,
        "vendor_id": delivery.vendor_id,
        "status": delivery.status.value,
        "events": [{"id": e.id, "type": e.type.value, "data": e.data, "timestamp": e.timestamp.isoformat()} for e in events],
    }


# --- Photo upload ---

@router.post("/photos")
async def upload_photo(
    file: UploadFile = File(...),
    delivery_id: str = Form(...),
    discrepancy_id: str = Form(...),
):
    """Upload a damage photo, run vision assessment, apply policy engine, return result."""
    store = get_store()
    service = get_service()

    # Determine photo storage path
    photos_dir = Path("/data/photos") if os.path.isdir("/data") else Path("photos")
    photos_dir.mkdir(parents=True, exist_ok=True)

    # Save photo
    photo_id = str(uuid.uuid4())
    ext = Path(file.filename or "photo.jpg").suffix or ".jpg"
    filename = f"{photo_id}{ext}"
    filepath = photos_dir / filename

    image_bytes = await file.read()
    filepath.write_bytes(image_bytes)

    # Record in DB
    photo = Photo(
        id=photo_id,
        delivery_id=delivery_id,
        discrepancy_id=discrepancy_id,
        filename=filename,
    )
    store.add_photo(photo)

    # Write photo uploaded event
    store.add_event(Event(
        delivery_id=delivery_id,
        type=EventType.PHOTO_UPLOADED,
        data={"photo_id": photo_id, "discrepancy_id": discrepancy_id, "filename": filename},
    ))

    # Run vision assessment
    from backend.vision import assess_damage

    # Get material context from recent events
    events = store.get_events(delivery_id)
    material_desc = "Unknown material"
    for e in reversed(events):
        if e.data.get("discrepancy_id") == discrepancy_id or e.type.value == "damage_reported":
            material_desc = e.data.get("material_description", material_desc)
            break

    content_type = file.content_type or "image/jpeg"
    assessment = await assess_damage(image_bytes, material_desc, content_type=content_type)

    if assessment:
        # Write assessment event
        store.add_event(Event(
            delivery_id=delivery_id,
            type=EventType.ASSESSMENT_COMPLETE,
            data={
                "photo_id": photo_id,
                "discrepancy_id": discrepancy_id,
                "assessment": assessment.model_dump(),
            },
        ))

        # Apply policy engine
        from backend.policy import evaluate_discrepancy
        from backend.services import get_po, get_vendor

        delivery = store.get_delivery(delivery_id)
        po = get_po(delivery.po_number) if delivery else None
        vendor = get_vendor(delivery.vendor_id) if delivery else None
        vendor_name = vendor.NAME1 if vendor else "Unknown"
        po_number = delivery.po_number if delivery else "Unknown"

        # Pull discrepancy data from the damage_reported event (which used
        # fuzzy PO matching and has the correct unit_value_eur / total_value_eur).
        unit_value = 0.0
        damage_qty = 1
        for e in reversed(events):
            if e.type == EventType.DAMAGE_REPORTED and e.data.get("discrepancy", {}).get("id") == discrepancy_id:
                unit_value = e.data["discrepancy"].get("unit_value_eur", 0.0)
                damage_qty = e.data["discrepancy"].get("actual_qty", 1)
                break

        disc_for_policy = Discrepancy(
            id=discrepancy_id,
            type=DiscrepancyType.DAMAGE,
            damage_description=assessment.description,
            actual_qty=damage_qty,
            unit_value_eur=unit_value,
            total_value_eur=unit_value * damage_qty,
        )

        policy_decision = evaluate_discrepancy(disc_for_policy, assessment, vendor_name, po_number)

        # Write policy decision event
        store.add_event(Event(
            delivery_id=delivery_id,
            type=EventType.POLICY_DECISION,
            data={
                "discrepancy_id": discrepancy_id,
                "decision": policy_decision.decision.value,
                "reason": policy_decision.reason,
                "claim": policy_decision.claim.model_dump() if policy_decision.claim else None,
            },
        ))

        # If escalation required, create escalation record
        esc = None
        if policy_decision.decision == Decision.ESCALATE:
            esc = Escalation(delivery_id=delivery_id, discrepancy_id=discrepancy_id)
            store.create_escalation(esc)
            store.add_event(Event(
                delivery_id=delivery_id,
                type=EventType.ESCALATION_CREATED,
                data={"escalation_id": esc.id, "discrepancy_id": discrepancy_id, "reason": policy_decision.reason},
            ))

        return {
            "photo_id": photo_id,
            "assessment": assessment.model_dump(),
            "decision": {
                "decision": policy_decision.decision.value,
                "reason": policy_decision.reason,
                "claim": policy_decision.claim.model_dump() if policy_decision.claim else None,
            },
            "escalation_id": esc.id if esc else None,
            "speech": f"Photo analyzed. {assessment.description}. {policy_decision.reason}",
        }
    else:
        # Vision failed - store photo, mark for review (will be escalated by policy engine)
        store.add_event(Event(
            delivery_id=delivery_id,
            type=EventType.ASSESSMENT_COMPLETE,
            data={
                "photo_id": photo_id,
                "discrepancy_id": discrepancy_id,
                "assessment": None,
                "vision_failed": True,
            },
            needs_review=True,
        ))
        return {
            "photo_id": photo_id,
            "assessment": None,
            "speech": "I couldn't analyze the photo. I've saved it and flagged it for manual review.",
            "needs_review": True,
        }


@router.get("/photos/{photo_id}")
async def get_photo(photo_id: str):
    """Serve stored evidence photos to dashboard clients."""
    store = get_store()
    photo = store.get_photo(photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="Photo not found")

    photos_dir = Path("/data/photos") if os.path.isdir("/data") else Path("photos")
    filepath = photos_dir / photo.filename
    if not filepath.is_file():
        raise HTTPException(status_code=404, detail="Photo file not found")
    return FileResponse(filepath)


# --- SSE stream ---

@router.get("/stream")
async def event_stream(last_event_id: int = 0):
    """Server-sent events stream for real-time updates."""
    from starlette.responses import StreamingResponse

    async def generate():
        current_id = last_event_id
        while True:
            store = get_store()
            events = store.get_events_since(current_id)
            for event in events:
                data = {
                    "type": event.type.value,
                    "delivery_id": event.delivery_id,
                    "event_id": event.id,
                    "payload": event.data,
                    "needs_review": event.needs_review,
                    "timestamp": event.timestamp.isoformat(),
                }
                yield f"event: {event.type.value}\ndata: {json_module.dumps(data)}\n\n"
                current_id = event.id
            await asyncio.sleep(1)

    return StreamingResponse(generate(), media_type="text/event-stream")


# --- Export endpoints ---

@router.get("/deliveries/{delivery_id}/export/gr")
async def export_goods_receipt(delivery_id: str):
    """Export a GoodsReceiptDocument as JSON for SAP goods receipt posting."""
    store = get_store()
    delivery = store.get_delivery(delivery_id)
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    events = store.get_events(delivery_id)
    today = date.today()

    # Aggregate LINE_LOGGED events by PO item (EBELP), summing quantities
    lines_by_ebelp: dict[str, GRLine] = {}
    for event in events:
        if event.type != EventType.LINE_LOGGED:
            continue
        if event.data.get("line_status", "received") != "received":
            continue
        data = event.data
        ebelp = data.get("po_line")
        if not ebelp:
            continue
        qty = data.get("this_qty", 0.0)
        if ebelp in lines_by_ebelp:
            lines_by_ebelp[ebelp].MENGE += qty
        else:
            lines_by_ebelp[ebelp] = GRLine(
                EBELN=delivery.po_number,
                EBELP=ebelp,
                MATNR=data.get("material_number", ""),
                MAKTX=data.get("material_description", ""),
                MENGE=qty,
                MEINS=data.get("unit_of_measure", ""),
            )

    gr_doc = GoodsReceiptDocument(
        BLDAT=today,
        BUDAT=today,
        lines=list(lines_by_ebelp.values()),
    )
    return gr_doc.model_dump(mode="json")


@router.get("/deliveries/{delivery_id}/export/qn")
async def export_quality_notifications(delivery_id: str):
    """Export QualityNotifications as JSON for SAP quality management."""
    from backend.services import get_vendor

    store = get_store()
    delivery = store.get_delivery(delivery_id)
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")

    events = store.get_events(delivery_id)

    vendor = get_vendor(delivery.vendor_id)
    vendor_name = vendor.NAME1 if vendor else delivery.vendor_id

    # Index ASSESSMENT_COMPLETE, POLICY_DECISION, and PHOTO_UPLOADED events by discrepancy_id
    assessments: dict[str, DamageAssessment] = {}
    decisions: dict[str, str] = {}
    photos: dict[str, list[str]] = {}

    for event in events:
        disc_id = event.data.get("discrepancy_id")
        if not disc_id:
            continue
        if event.type == EventType.ASSESSMENT_COMPLETE:
            raw = event.data.get("assessment")
            if raw:
                assessments[disc_id] = DamageAssessment(**raw)
        elif event.type == EventType.POLICY_DECISION:
            decisions[disc_id] = event.data.get("decision", "")
        elif event.type == EventType.PHOTO_UPLOADED:
            photos.setdefault(disc_id, []).append(event.data.get("filename", ""))

    notifications: list[dict] = []
    for event in events:
        if event.type != EventType.DAMAGE_REPORTED:
            continue
        disc_data = event.data.get("discrepancy", {})
        disc_id = disc_data.get("id", "")
        matnr = event.data.get("material_number") or disc_data.get("material_number", "")
        description = disc_data.get("damage_description") or event.data.get("description", "")

        qn = QualityNotification(
            MATNR=matnr,
            vendor=vendor_name,
            description=description,
            damage_assessment=assessments.get(disc_id),
            decision=decisions.get(disc_id, ""),
            photos=photos.get(disc_id, []),
        )
        notifications.append(qn.model_dump(mode="json"))

    return notifications


@router.get("/deliveries/{delivery_id}/export/report")
async def export_delivery_report(delivery_id: str):
    """Export an operational summary alongside the SAP documents."""
    from backend.services import get_po

    store = get_store()
    delivery = store.get_delivery(delivery_id)
    if not delivery:
        raise HTTPException(status_code=404, detail="Delivery not found")
    po = get_po(delivery.po_number)
    if not po:
        raise HTTPException(status_code=404, detail="Purchase order not found")

    received_by_line: dict[str, float] = {}
    damaged_by_discrepancy: dict[str, float] = {}
    for event in store.get_events(delivery_id):
        if event.type == EventType.LINE_LOGGED and event.data.get("po_line"):
            if event.data.get("line_status", "received") != "received":
                continue
            line = event.data["po_line"]
            received_by_line[line] = received_by_line.get(line, 0.0) + float(event.data.get("this_qty", 0.0))
        elif event.type == EventType.DAMAGE_REPORTED:
            discrepancy = event.data.get("discrepancy", {})
            discrepancy_id = discrepancy.get("id", "")
            damaged_by_discrepancy[discrepancy_id] = float(discrepancy.get("actual_qty") or 0.0)

    ordered_units = sum(line.MENGE for line in po.lines)
    received_units = sum(received_by_line.values())
    missing_units = sum(max(line.MENGE - received_by_line.get(line.EBELP, 0.0), 0.0) for line in po.lines)
    missing_lines = sum(received_by_line.get(line.EBELP, 0.0) < line.MENGE for line in po.lines)
    overage_units = sum(max(received_by_line.get(line.EBELP, 0.0) - line.MENGE, 0.0) for line in po.lines)
    escalations = store.list_escalations(delivery_id)

    return {
        "delivery_id": delivery_id,
        "po_number": delivery.po_number,
        "status": delivery.status.value,
        "ordered_units": ordered_units,
        "received_units": received_units,
        "missing_units": missing_units,
        "missing_lines": missing_lines,
        "damaged_units": sum(damaged_by_discrepancy.values()),
        "damaged_lines": len(damaged_by_discrepancy),
        "overage_units": overage_units,
        "pending_escalations": sum(e.status.value == "pending" for e in escalations),
        "resolved_escalations": sum(e.status.value != "pending" for e in escalations),
    }


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _build_text_pdf(lines: list[str]) -> bytes:
    """Build a small dependency-free PDF for the operational report."""
    content = ["BT", "/F1 11 Tf", "50 760 Td"]
    for index, line in enumerate(lines):
        if index:
            content.append("0 -16 Td")
        content.append(f"({_pdf_escape(line)}) Tj")
    content.append("ET")
    stream = "\n".join(content).encode("latin-1", errors="replace")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    pdf = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for number, obj in enumerate(objects, start=1):
        offsets.append(len(pdf))
        pdf.extend(f"{number} 0 obj\n".encode())
        pdf.extend(obj)
        pdf.extend(b"\nendobj\n")
    xref = len(pdf)
    pdf.extend(f"xref\n0 {len(objects) + 1}\n".encode())
    pdf.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        pdf.extend(f"{offset:010d} 00000 n \n".encode())
    pdf.extend(f"trailer\n<< /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF".encode())
    return bytes(pdf)


@router.get("/deliveries/{delivery_id}/export/report.pdf")
async def export_delivery_report_pdf(delivery_id: str):
    """Download the same operational report as a printable PDF."""
    report = await export_delivery_report(delivery_id)
    store = get_store()
    delivery = store.get_delivery(delivery_id)
    events = store.get_events(delivery_id)
    lines = [
        "ArgusAI Delivery Report",
        f"Delivery: {delivery_id}",
        f"Purchase order: {report['po_number']}",
        f"Status: {report['status']}",
        "",
        f"Ordered: {report['ordered_units']:.0f}    Received: {report['received_units']:.0f}",
        f"Missing: {report['missing_units']:.0f} ({report['missing_lines']} lines)",
        f"Damaged: {report['damaged_units']:.0f} ({report['damaged_lines']} lines)",
        f"Over-received: {report['overage_units']:.0f}",
        f"Pending escalations: {report['pending_escalations']}",
        f"Resolved escalations: {report['resolved_escalations']}",
        "",
        "Line activity:",
    ]
    for event in events:
        if event.type != EventType.LINE_LOGGED:
            continue
        data = event.data
        description = data.get("material_description", "Unmatched item")
        status = data.get("line_status", "received")
        quantity = data.get("this_qty", 0)
        lines.append(f"- {description}: {quantity:g} ({status})")
    pdf = _build_text_pdf(lines[:45])
    return Response(
        content=pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{delivery_id}-report.pdf"'},
    )


# --- Escalation management ---

@router.get("/escalations")
async def list_escalations(delivery_id: str | None = None):
    store = get_store()
    escalations = store.list_escalations(delivery_id)
    return [
        {
            "id": e.id,
            "delivery_id": e.delivery_id,
            "discrepancy_id": e.discrepancy_id,
            "status": e.status.value,
            "decided_at": e.decided_at.isoformat() if e.decided_at else None,
            "decided_by": e.decided_by,
        }
        for e in escalations
    ]


@router.post("/escalations/{escalation_id}/decision")
async def decide_escalation(escalation_id: str, req: EscalationDecisionRequest):
    """Manager accepts or rejects an escalation. Idempotent."""
    store = get_store()

    esc = store.get_escalation(escalation_id)
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")

    decided = store.decide_escalation(escalation_id, req.decision, req.decided_by)

    # Write decision event
    store.add_event(Event(
        delivery_id=decided.delivery_id,
        type=EventType.ESCALATION_DECIDED,
        data={
            "escalation_id": decided.id,
            "decision": decided.status.value,
            "decided_by": decided.decided_by,
        },
    ))

    speech = (
        "Manager approved - proceed with receiving."
        if req.decision == "accepted"
        else "Manager rejected - set aside for return."
    )

    return {
        "speech": speech,
        "escalation": {
            "id": decided.id,
            "status": decided.status.value,
            "decided_by": decided.decided_by,
        },
    }
