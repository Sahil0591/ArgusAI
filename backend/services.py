from __future__ import annotations

import json
import uuid
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


class DeliveryService:
    """Orchestrates delivery operations against the store."""

    def __init__(self, store: Store):
        self.store = store
        # Track received quantities per delivery per PO line: {delivery_id: {EBELP: qty}}
        self._received: dict[str, dict[str, float]] = {}

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

        # Match to PO line
        po_line = fuzzy_match_po_line(po, spoken.material_description)
        if not po_line:
            return self._fail_event(spoken, f"Could not match '{spoken.material_description}' to any PO line")

        # Track received quantity
        if spoken.delivery_id not in self._received:
            self._received[spoken.delivery_id] = {}
        prev_qty = self._received[spoken.delivery_id].get(po_line.EBELP, 0.0)
        new_qty = prev_qty + spoken.quantity
        self._received[spoken.delivery_id][po_line.EBELP] = new_qty

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

        # Build event data
        event_data = {
            "po_line": po_line.EBELP,
            "material_number": po_line.MATNR,
            "material_description": po_line.MAKTX,
            "ordered_qty": po_line.MENGE,
            "received_qty": new_qty,
            "this_qty": spoken.quantity,
            "unit_of_measure": spoken.unit_of_measure or po_line.MEINS,
            "pallet_number": spoken.pallet_number,
            "discrepancies": [d.model_dump() for d in discrepancies],
        }

        event = Event(
            delivery_id=spoken.delivery_id,
            type=EventType.LINE_LOGGED,
            data=event_data,
        )
        saved = self.store.add_event(event)

        # Build speech response
        speech_parts = [f"Logged {spoken.quantity:.0f} {po_line.MEINS} of {po_line.MAKTX}."]
        if spoken.damage_noted:
            speech_parts.append(f"Damage noted: {spoken.damage_noted}. Please take a photo.")
        if new_qty > po_line.MENGE:
            speech_parts.append(f"Warning: received {new_qty:.0f} but only {po_line.MENGE:.0f} ordered.")

        return {
            "speech": " ".join(speech_parts),
            "event_id": saved.id,
            "po_line": po_line.EBELP,
            "material_number": po_line.MATNR,
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

    def report_damage(self, delivery_id: str, material_description: str, description: str, quantity: int = 1) -> dict:
        """Report damage for a material, request photo."""
        delivery = self.store.get_delivery(delivery_id)
        if not delivery:
            return {"speech": "No active delivery found.", "error": True}

        po = get_po(delivery.po_number)
        po_line = fuzzy_match_po_line(po, material_description) if po else None

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
                "material_description": material_description,
                "material_number": po_line.MATNR if po_line else None,
            },
        )
        saved = self.store.add_event(event)

        return {
            "speech": f"Damage reported for {material_description}: {description}. Please take a photo.",
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
            data={"raw_transcript": spoken.raw_transcript, "error": reason},
            needs_review=True,
        )
        self.store.add_event(event)
        return {
            "speech": f"I couldn't match that line. I've logged it for review. {reason}",
            "error": True,
            "needs_review": True,
        }
