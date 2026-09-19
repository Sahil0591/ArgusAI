from __future__ import annotations

import datetime
import traceback

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend import config
from backend.models import SpokenLine


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
                        },
                        "required": ["delivery_id", "material_description", "quantity"],
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
            raw_transcript=req.raw_transcript,
        )
        return service.log_line(spoken)
    except Exception as exc:
        # Never drop an utterance - log with needs_review
        from backend.models import Event, EventType
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
