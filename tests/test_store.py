from __future__ import annotations

import pytest

from backend.models import (
    Delivery, Escalation, EscalationStatus, Event, EventType, Photo,
)
from backend.store import Store


@pytest.fixture
def store():
    s = Store(":memory:")
    s.init_db()
    yield s
    s.close()


@pytest.fixture
def delivery(store: Store) -> Delivery:
    d = Delivery(id="D-TEST", po_number="PO-4500001", vendor_id="V001")
    return store.create_delivery(d)


def test_init_creates_tables(store: Store):
    tables = store.conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).fetchall()
    names = {r["name"] for r in tables}
    assert {"events", "deliveries", "escalations", "photos"} <= names


def test_add_and_get_event(store: Store, delivery: Delivery):
    evt = Event(delivery_id=delivery.id, type=EventType.LINE_LOGGED, data={"material": "M8 bolts", "qty": 50})
    saved = store.add_event(evt)
    assert saved.id is not None
    events = store.get_events(delivery.id)
    assert len(events) == 1
    assert events[0].data["material"] == "M8 bolts"


def test_events_append_only(store: Store, delivery: Delivery):
    for i in range(5):
        store.add_event(Event(delivery_id=delivery.id, type=EventType.LINE_LOGGED, data={"i": i}))
    events = store.get_events(delivery.id)
    assert len(events) == 5
    assert [e.data["i"] for e in events] == [0, 1, 2, 3, 4]


def test_get_events_since(store: Store, delivery: Delivery):
    ids = []
    for i in range(3):
        e = store.add_event(Event(delivery_id=delivery.id, type=EventType.LINE_LOGGED, data={"i": i}))
        ids.append(e.id)
    since = store.get_events_since(ids[1])
    assert len(since) == 1
    assert since[0].data["i"] == 2


def test_needs_review_flag(store: Store, delivery: Delivery):
    evt = Event(delivery_id=delivery.id, type=EventType.LINE_LOGGED, data={}, needs_review=True)
    saved = store.add_event(evt)
    retrieved = store.get_events(delivery.id)
    assert retrieved[0].needs_review is True


def test_delivery_crud(store: Store):
    d = Delivery(id="D-1", po_number="PO-001", vendor_id="V001")
    store.create_delivery(d)
    got = store.get_delivery("D-1")
    assert got is not None
    assert got.po_number == "PO-001"
    assert got.status.value == "in_progress"


def test_complete_delivery(store: Store, delivery: Delivery):
    store.complete_delivery(delivery.id)
    got = store.get_delivery(delivery.id)
    assert got.status.value == "completed"
    assert got.completed_at is not None


def test_list_deliveries(store: Store):
    for i in range(3):
        store.create_delivery(Delivery(id=f"D-{i}", po_number=f"PO-{i}", vendor_id="V001"))
    all_d = store.list_deliveries()
    assert len(all_d) == 3


def test_escalation_lifecycle(store: Store, delivery: Delivery):
    esc = Escalation(id="E-1", delivery_id=delivery.id, discrepancy_id="disc-1")
    store.create_escalation(esc)

    got = store.get_escalation("E-1")
    assert got.status == EscalationStatus.PENDING

    decided = store.decide_escalation("E-1", "accepted", "manager")
    assert decided.status == EscalationStatus.ACCEPTED
    assert decided.decided_by == "manager"


def test_escalation_idempotent(store: Store, delivery: Delivery):
    esc = Escalation(id="E-2", delivery_id=delivery.id, discrepancy_id="disc-2")
    store.create_escalation(esc)
    store.decide_escalation("E-2", "rejected", "manager")

    # Second decision should not overwrite
    second = store.decide_escalation("E-2", "accepted", "other_manager")
    assert second.status == EscalationStatus.REJECTED
    assert second.decided_by == "manager"


def test_photo_crud(store: Store, delivery: Delivery):
    photo = Photo(id="P-1", delivery_id=delivery.id, discrepancy_id="disc-1", filename="damage.jpg")
    store.add_photo(photo)
    photos = store.get_photos("disc-1")
    assert len(photos) == 1
    assert photos[0].filename == "damage.jpg"
