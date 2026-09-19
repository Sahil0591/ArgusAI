from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime, timedelta
from pathlib import Path
from difflib import SequenceMatcher

from backend.models import (
    Delivery, Discrepancy, DiscrepancyType, Event, EventType,
    Material, POLine, PurchaseOrder, SpokenLine, Vendor,
)
from backend.store import Store


SEED_DIR = Path(__file__).parent / "seed"


def _load_json(filename: str) -> list[dict]:
    return json.loads((SEED_DIR / filename).read_text())


# --- Seed data (loaded once at module level) ---

VENDORS: list[Vendor] = [Vendor(**v) for v in _load_json("vendors.json")]
MATERIALS: list[Material] = [Material(**m) for m in _load_json("materials.json")]
PURCHASE_ORDERS: list[PurchaseOrder] = [PurchaseOrder(**p) for p in _load_json("purchase_orders.json")]


def get_po(po_number: str) -> PurchaseOrder | None:
    for po in PURCHASE_ORDERS:
        if po.EBELN == po_number:
            return po
    return None


def get_vendor(vendor_id: str) -> Vendor | None:
    for v in VENDORS:
        if v.LIFNR == vendor_id:
            return v
    return None


def fuzzy_match_po_line(po: PurchaseOrder, material_description: str) -> POLine | None:
    """Match a spoken material description to a PO line using fuzzy string matching."""
    best_match: POLine | None = None
    best_score = 0.0
    desc_lower = material_description.lower()
    for line in po.lines:
        score = SequenceMatcher(None, desc_lower, line.MAKTX.lower()).ratio()
        # Also check if key words from the spoken description appear in the PO line
        words = desc_lower.split()
        word_hits = sum(1 for w in words if w in line.MAKTX.lower()) / max(len(words), 1)
        combined = max(score, word_hits)
        if combined > best_score:
            best_score = combined
            best_match = line
    if best_score >= 0.35:  # fairly permissive for voice input
        return best_match
    return None


DUPLICATE_WINDOW = timedelta(seconds=8)


class DeliveryService:
    """Orchestrates delivery operations against the store."""

    def __init__(self, store: Store):
        self.store = store
        # Track received quantities per delivery per PO line: {delivery_id: {EBELP: qty}}
        self._received: dict[str, dict[str, float]] = {}

    def _recent_event(self, delivery_id: str, event_type: EventType, matches) -> Event | None:
        """Most recent event of this type within DUPLICATE_WINDOW whose data
        satisfies `matches`. The Gemini Live API can regenerate a tool call
        for a single spoken utterance under a fresh call id - sometimes even
        with slightly different transcribed text (observed live: "5DN" vs
        "5DN50" for the same damage report) - so a tool_call_id replay check
        alone doesn't catch it. This is a content-based fallback."""
        cutoff = datetime.now(UTC) - DUPLICATE_WINDOW
        for event in reversed(self.store.get_events(delivery_id)):
            if event.timestamp < cutoff:
                break
            if event.type == event_type and matches(event.data):
                return event
        return None

    @staticmethod
    def _duplicate_line_response(event: Event) -> dict:
        return {
            "speech": "That line was already logged.",
            "event_id": event.id,
            "duplicate": True,
            "po_line": event.data.get("po_line"),
            "material_number": event.data.get("material_number"),
            "material_description": event.data.get("material_description"),
            "line_status": event.data.get("line_status", "received"),
            "discrepancies": event.data.get("discrepancies", []),
        }

    def start_delivery(self, delivery_id: str, po_number: str) -> Delivery:
        """Start or resume a delivery."""
        existing = self.store.get_delivery(delivery_id)
        if existing:
            return existing
        po = get_po(po_number)
        if not po:
            raise ValueError(f"Unknown PO: {po_number}")
        delivery = Delivery(id=delivery_id, po_number=po_number, vendor_id=po.LIFNR)
        self.store.create_delivery(delivery)
        self._received[delivery_id] = {}
        return delivery

    def log_line(self, spoken: SpokenLine) -> dict:
        """
        Process a spoken line: match to PO, detect discrepancies, write event.
        Returns dict with speech text and structured data for the frontend.
        """
        delivery = self.store.get_delivery(spoken.delivery_id)
        if not delivery:
            return self._fail_event(spoken, "No active delivery found")

        po = get_po(delivery.po_number)
        if not po:
            return self._fail_event(spoken, "PO not found")

        # Gemini may replay a function call while waiting for the tool
        # response. The call ID makes the operation idempotent across retries.
        if spoken.tool_call_id:
            dup = self._recent_event(
                spoken.delivery_id,
                EventType.LINE_LOGGED,
                lambda data: data.get("tool_call_id") == spoken.tool_call_id,
            )
            if dup:
                return self._duplicate_line_response(dup)

        # Match to PO line
        po_line = fuzzy_match_po_line(po, spoken.material_description)
        if not po_line:
            return self._fail_event(spoken, f"Could not match '{spoken.material_description}' to any PO line")

        # Fallback for when Gemini issues a genuinely new call id for what
        # was really the same utterance (see _recent_event docstring): same
        # resolved line, same quantity, same status, within the window.
        content_dup = self._recent_event(
            spoken.delivery_id,
            EventType.LINE_LOGGED,
            lambda data: (
                data.get("po_line") == po_line.EBELP
                and float(data.get("this_qty", -1)) == spoken.quantity
                and data.get("line_status", "received") == spoken.line_status
            ),
        )
        if content_dup:
            return self._duplicate_line_response(content_dup)

        # Derive the running received quantity from persisted events so a
        # container restart cannot reset the progress shown to the clerk.
        prev_qty = sum(
            float(event.data.get("this_qty", 0.0))
            for event in self.store.get_events(spoken.delivery_id)
            if event.type == EventType.LINE_LOGGED
            and event.data.get("po_line") == po_line.EBELP
            and event.data.get("line_status", "received") == "received"
        )
        is_missing = spoken.line_status == "missing"
        new_qty = prev_qty if is_missing else prev_qty + spoken.quantity

        # Detect discrepancies
        discrepancies: list[Discrepancy] = []
        photo_requested = False

        if spoken.damage_noted:
            disc = Discrepancy(
                type=DiscrepancyType.DAMAGE,
                damage_description=spoken.damage_noted,
                actual_qty=spoken.quantity,
                unit_value_eur=po_line.NETPR,
                total_value_eur=po_line.NETPR * spoken.quantity,
            )
            discrepancies.append(disc)
            photo_requested = True

        # Overage (received > ordered) is deterministic - unlike damage it
        # doesn't need a photo/vision pass, so resolve it against the policy
        # engine synchronously, right here.
        overage_disc: Discrepancy | None = None
        if new_qty > po_line.MENGE:
            overage_disc = Discrepancy(
                type=DiscrepancyType.OVERAGE,
                expected_qty=po_line.MENGE,
                actual_qty=new_qty,
                unit_value_eur=po_line.NETPR,
                total_value_eur=po_line.NETPR * (new_qty - po_line.MENGE),
            )
            discrepancies.append(overage_disc)

        # Build event data
        event_data = {
            "po_line": po_line.EBELP,
            "material_number": po_line.MATNR,
            "material_description": po_line.MAKTX,
            "ordered_qty": po_line.MENGE,
            "received_qty": new_qty,
            "this_qty": spoken.quantity,
            "line_status": spoken.line_status,
            "missing_qty": spoken.quantity if is_missing else 0.0,
            "unit_of_measure": spoken.unit_of_measure or po_line.MEINS,
            "pallet_number": spoken.pallet_number,
            "tool_call_id": spoken.tool_call_id,
            "discrepancies": [d.model_dump() for d in discrepancies],
        }

        event = Event(
            delivery_id=spoken.delivery_id,
            type=EventType.LINE_LOGGED,
            data=event_data,
        )
        saved = self.store.add_event(event)

        overage_reason: str | None = None
        if overage_disc:
            from backend.policy import evaluate_discrepancy

            vendor = get_vendor(delivery.vendor_id)
            policy_decision = evaluate_discrepancy(
                overage_disc, None, vendor.NAME1 if vendor else "Unknown", delivery.po_number
            )
            self.store.add_event(Event(
                delivery_id=spoken.delivery_id,
                type=EventType.POLICY_DECISION,
                data={
                    "discrepancy_id": overage_disc.id,
                    "decision": policy_decision.decision.value,
                    "reason": policy_decision.reason,
                    "claim": None,
                },
            ))
            overage_reason = policy_decision.reason

        # Build speech response
        speech_parts = [
            f"Marked {spoken.quantity:.0f} {po_line.MEINS} of {po_line.MAKTX} as missing."
            if is_missing
            else f"Logged {spoken.quantity:.0f} {po_line.MEINS} of {po_line.MAKTX}."
        ]
        if spoken.damage_noted:
            speech_parts.append(f"Damage noted: {spoken.damage_noted}. Please take a photo.")
        if overage_reason:
            speech_parts.append(overage_reason)

        return {
            "speech": " ".join(speech_parts),
            "event_id": saved.id,
            "po_line": po_line.EBELP,
            "material_number": po_line.MATNR,
            "material_description": po_line.MAKTX,
            "line_status": spoken.line_status,
            "discrepancies": [d.model_dump() for d in discrepancies],
            "photo_requested": photo_requested,
        }

    def close_pallet(self, delivery_id: str, pallet_number: int) -> dict:
        """Close a pallet and return summary."""
        delivery = self.store.get_delivery(delivery_id)
        if not delivery:
            return {"speech": "No active delivery found.", "error": True}

        events = self.store.get_events(delivery_id)
        pallet_events = [
            e for e in events
            if e.type == EventType.LINE_LOGGED and e.data.get("pallet_number") == pallet_number
        ]

        event = Event(
            delivery_id=delivery_id,
            type=EventType.DELIVERY_CLOSED,  # reuse for pallet close
            data={"pallet_number": pallet_number, "line_count": len(pallet_events)},
        )
        self.store.add_event(event)

        return {
            "speech": f"Pallet {pallet_number} closed with {len(pallet_events)} items logged.",
            "pallet_number": pallet_number,
            "line_count": len(pallet_events),
        }

    def dismiss_unmatched(self, delivery_id: str, event_id: int) -> dict:
        """Hide an unmatched voice line while keeping an auditable correction event."""
        delivery = self.store.get_delivery(delivery_id)
        if not delivery:
            return {"speech": "No active delivery found.", "error": True}
        events = self.store.get_events(delivery_id)
        original = next((e for e in events if e.id == event_id), None)
        if not original or original.type != EventType.LINE_LOGGED or original.data.get("line_status") != "unmatched":
            return {"speech": "That unmatched line could not be found.", "error": True}
        if any(e.data.get("dismisses_event_id") == event_id for e in events):
            return {"speech": "That unmatched line was already removed.", "event_id": event_id, "duplicate": True}
        event = self.store.add_event(Event(
            delivery_id=delivery_id,
            type=EventType.LINE_LOGGED,
            data={"dismisses_event_id": event_id, "line_status": "unmatched_dismissed"},
        ))
        return {"speech": "Unmatched line removed from the checklist.", "event_id": event.id}

    def report_damage(
        self,
        delivery_id: str,
        material_description: str,
        description: str,
        quantity: int = 1,
        tool_call_id: str | None = None,
    ) -> dict:
        """Report damage for a material, request photo."""
        delivery = self.store.get_delivery(delivery_id)
        if not delivery:
            return {"speech": "No active delivery found.", "error": True}

        def _duplicate_response(event: Event) -> dict:
            return {
                "speech": "That damage was already reported.",
                "event_id": event.id,
                "discrepancy_id": event.data.get("discrepancy", {}).get("id"),
                "duplicate": True,
                "photo_requested": True,
            }

        if tool_call_id:
            dup = self._recent_event(
                delivery_id, EventType.DAMAGE_REPORTED, lambda data: data.get("tool_call_id") == tool_call_id
            )
            if dup:
                return _duplicate_response(dup)

        po = get_po(delivery.po_number)
        po_line = fuzzy_match_po_line(po, material_description) if po else None
        canonical_description = po_line.MAKTX if po_line else material_description

        # Same fallback as log_line: Gemini can regenerate this call under a
        # fresh id (and sometimes slightly different transcribed text) for
        # one spoken utterance. Only applied when the line actually
        # resolved, so two genuinely separate unmatched-item reports within
        # the window aren't collapsed into one.
        if po_line:
            content_dup = self._recent_event(
                delivery_id,
                EventType.DAMAGE_REPORTED,
                lambda data: (
                    data.get("material_number") == po_line.MATNR
                    and (data.get("discrepancy") or {}).get("actual_qty") == quantity
                ),
            )
            if content_dup:
                return _duplicate_response(content_dup)

        disc = Discrepancy(
            type=DiscrepancyType.DAMAGE,
            damage_description=description,
            actual_qty=quantity,
            unit_value_eur=po_line.NETPR if po_line else 0,
            total_value_eur=(po_line.NETPR if po_line else 0) * quantity,
        )

        event = Event(
            delivery_id=delivery_id,
            type=EventType.DAMAGE_REPORTED,
            data={
                "discrepancy": disc.model_dump(),
                "material_description": canonical_description,
                "material_number": po_line.MATNR if po_line else None,
                "tool_call_id": tool_call_id,
            },
        )
        saved = self.store.add_event(event)

        return {
            "speech": f"Damage reported for {canonical_description}: {description}. Please take a photo.",
            "event_id": saved.id,
            "discrepancy_id": disc.id,
            "photo_requested": True,
        }

    def get_delivery_status(self, delivery_id: str) -> dict:
        """Return current delivery status summary."""
        delivery = self.store.get_delivery(delivery_id)
        if not delivery:
            return {"speech": "No delivery found with that ID.", "error": True}

        po = get_po(delivery.po_number)
        events = self.store.get_events(delivery_id)
        line_events = [e for e in events if e.type == EventType.LINE_LOGGED]

        received = self._received.get(delivery_id, {})
        lines_summary = []
        pending_lines = []
        if po:
            for pl in po.lines:
                qty = received.get(pl.EBELP, 0)
                lines_summary.append({
                    "material": pl.MAKTX,
                    "ordered": pl.MENGE,
                    "received": qty,
                })
                if qty < pl.MENGE:
                    pending_lines.append(pl.MAKTX)

        total_ordered = sum(pl.MENGE for pl in po.lines) if po else 0
        total_received = sum(received.values())

        speech = f"Delivery {delivery_id}: {len(line_events)} lines logged, {total_received:.0f} of {total_ordered:.0f} units received."
        if pending_lines:
            speech += f" Still pending: {', '.join(pending_lines[:3])}."

        return {
            "speech": speech,
            "delivery_id": delivery_id,
            "po_number": delivery.po_number,
            "status": delivery.status.value,
            "lines": lines_summary,
            "total_ordered": total_ordered,
            "total_received": total_received,
        }

    def _fail_event(self, spoken: SpokenLine, reason: str) -> dict:
        """Write a needs_review event when something fails, never drop an utterance."""
        event = Event(
            delivery_id=spoken.delivery_id,
            type=EventType.LINE_LOGGED,
            data={
                "raw_transcript": spoken.raw_transcript,
                "error": reason,
                "material_description": spoken.material_description,
                "material_number": None,
                "po_line": None,
                "ordered_qty": 0.0,
                "received_qty": 0.0,
                "this_qty": spoken.quantity,
                "unit_of_measure": spoken.unit_of_measure,
                "line_status": "unmatched",
                "tool_call_id": spoken.tool_call_id,
            },
            needs_review=True,
        )
        self.store.add_event(event)
        return {
            "speech": f"I couldn't match that line. I've logged it for review. {reason}",
            "error": True,
            "needs_review": True,
        }
