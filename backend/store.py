from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

from backend import config
from backend.models import (
    Delivery, DeliveryStatus, Escalation, EscalationStatus,
    Event, EventType, Photo,
)


class Store:
    """Thin wrapper around SQLite for the append-only event log and entities."""

    def __init__(self, db_path: str | None = None):
        self.db_path = db_path or config.DB_PATH
        self._conn: sqlite3.Connection | None = None

    @property
    def conn(self) -> sqlite3.Connection:
        if self._conn is None:
            self._conn = sqlite3.connect(self.db_path)
            self._conn.row_factory = sqlite3.Row
            self._conn.execute("PRAGMA journal_mode=WAL")
            self._conn.execute("PRAGMA foreign_keys=ON")
        return self._conn

    def init_db(self) -> None:
        """Create tables if they don't exist."""
        self.conn.executescript("""
            CREATE TABLE IF NOT EXISTS events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                delivery_id TEXT NOT NULL,
                timestamp TEXT NOT NULL DEFAULT (datetime('now')),
                type TEXT NOT NULL,
                data TEXT NOT NULL DEFAULT '{}',
                needs_review BOOLEAN NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS deliveries (
                id TEXT PRIMARY KEY,
                po_number TEXT NOT NULL,
                vendor_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'in_progress',
                started_at TEXT NOT NULL DEFAULT (datetime('now')),
                completed_at TEXT
            );

            CREATE TABLE IF NOT EXISTS escalations (
                id TEXT PRIMARY KEY,
                delivery_id TEXT NOT NULL,
                discrepancy_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                decided_at TEXT,
                decided_by TEXT
            );

            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                delivery_id TEXT NOT NULL,
                discrepancy_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
            );
        """)

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    # --- Events (append-only) ---

    def add_event(self, event: Event) -> Event:
        """Insert an event and return it with its assigned id."""
        cur = self.conn.execute(
            "INSERT INTO events (delivery_id, timestamp, type, data, needs_review) VALUES (?, ?, ?, ?, ?)",
            (event.delivery_id, event.timestamp.isoformat(), event.type.value,
             json.dumps(event.data), event.needs_review),
        )
        self.conn.commit()
        event.id = cur.lastrowid
        return event

    def get_events(self, delivery_id: str) -> list[Event]:
        rows = self.conn.execute(
            "SELECT * FROM events WHERE delivery_id = ? ORDER BY id", (delivery_id,)
        ).fetchall()
        return [self._row_to_event(r) for r in rows]

    def get_events_since(self, since_id: int = 0) -> list[Event]:
        """Get all events with id > since_id, across all deliveries."""
        rows = self.conn.execute(
            "SELECT * FROM events WHERE id > ? ORDER BY id", (since_id,)
        ).fetchall()
        return [self._row_to_event(r) for r in rows]

    def _row_to_event(self, row: sqlite3.Row) -> Event:
        return Event(
            id=row["id"],
            delivery_id=row["delivery_id"],
            timestamp=datetime.fromisoformat(row["timestamp"]),
            type=EventType(row["type"]),
            data=json.loads(row["data"]),
            needs_review=bool(row["needs_review"]),
        )

    # --- Deliveries ---

    def create_delivery(self, delivery: Delivery) -> Delivery:
        self.conn.execute(
            "INSERT INTO deliveries (id, po_number, vendor_id, status, started_at) VALUES (?, ?, ?, ?, ?)",
            (delivery.id, delivery.po_number, delivery.vendor_id,
             delivery.status.value, delivery.started_at.isoformat()),
        )
        self.conn.commit()
        return delivery

    def get_delivery(self, delivery_id: str) -> Delivery | None:
        row = self.conn.execute(
            "SELECT * FROM deliveries WHERE id = ?", (delivery_id,)
        ).fetchone()
        if not row:
            return None
        return Delivery(
            id=row["id"], po_number=row["po_number"], vendor_id=row["vendor_id"],
            status=DeliveryStatus(row["status"]),
            started_at=datetime.fromisoformat(row["started_at"]),
            completed_at=datetime.fromisoformat(row["completed_at"]) if row["completed_at"] else None,
        )

    def list_deliveries(self) -> list[Delivery]:
        rows = self.conn.execute("SELECT * FROM deliveries ORDER BY started_at DESC").fetchall()
        return [
            Delivery(
                id=r["id"], po_number=r["po_number"], vendor_id=r["vendor_id"],
                status=DeliveryStatus(r["status"]),
                started_at=datetime.fromisoformat(r["started_at"]),
                completed_at=datetime.fromisoformat(r["completed_at"]) if r["completed_at"] else None,
            )
            for r in rows
        ]

    def complete_delivery(self, delivery_id: str) -> None:
        self.conn.execute(
            "UPDATE deliveries SET status = ?, completed_at = ? WHERE id = ?",
            (DeliveryStatus.COMPLETED.value, datetime.now(UTC).isoformat(), delivery_id),
        )
        self.conn.commit()

    # --- Escalations ---

    def create_escalation(self, esc: Escalation) -> Escalation:
        self.conn.execute(
            "INSERT INTO escalations (id, delivery_id, discrepancy_id, status) VALUES (?, ?, ?, ?)",
            (esc.id, esc.delivery_id, esc.discrepancy_id, esc.status.value),
        )
        self.conn.commit()
        return esc

    def get_escalation(self, escalation_id: str) -> Escalation | None:
        row = self.conn.execute(
            "SELECT * FROM escalations WHERE id = ?", (escalation_id,)
        ).fetchone()
        if not row:
            return None
        return Escalation(
            id=row["id"], delivery_id=row["delivery_id"],
            discrepancy_id=row["discrepancy_id"],
            status=EscalationStatus(row["status"]),
            decided_at=datetime.fromisoformat(row["decided_at"]) if row["decided_at"] else None,
            decided_by=row["decided_by"],
        )

    def decide_escalation(self, escalation_id: str, decision: str, decided_by: str) -> Escalation | None:
        """Idempotent: if already decided, return existing decision without overwriting."""
        esc = self.get_escalation(escalation_id)
        if not esc:
            return None
        if esc.status != EscalationStatus.PENDING:
            return esc  # already decided, idempotent
        esc.status = EscalationStatus(decision)
        esc.decided_at = datetime.now(UTC)
        esc.decided_by = decided_by
        self.conn.execute(
            "UPDATE escalations SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?",
            (esc.status.value, esc.decided_at.isoformat(), esc.decided_by, esc.id),
        )
        self.conn.commit()
        return esc

    def list_escalations(self, delivery_id: str | None = None) -> list[Escalation]:
        if delivery_id:
            rows = self.conn.execute(
                "SELECT * FROM escalations WHERE delivery_id = ?", (delivery_id,)
            ).fetchall()
        else:
            rows = self.conn.execute("SELECT * FROM escalations").fetchall()
        return [
            Escalation(
                id=r["id"], delivery_id=r["delivery_id"],
                discrepancy_id=r["discrepancy_id"],
                status=EscalationStatus(r["status"]),
                decided_at=datetime.fromisoformat(r["decided_at"]) if r["decided_at"] else None,
                decided_by=r["decided_by"],
            )
            for r in rows
        ]

    # --- Photos ---

    def add_photo(self, photo: Photo) -> Photo:
        self.conn.execute(
            "INSERT INTO photos (id, delivery_id, discrepancy_id, filename, uploaded_at) VALUES (?, ?, ?, ?, ?)",
            (photo.id, photo.delivery_id, photo.discrepancy_id,
             photo.filename, photo.uploaded_at.isoformat()),
        )
        self.conn.commit()
        return photo

    def get_photos(self, discrepancy_id: str) -> list[Photo]:
        rows = self.conn.execute(
            "SELECT * FROM photos WHERE discrepancy_id = ?", (discrepancy_id,)
        ).fetchall()
        return [
            Photo(
                id=r["id"], delivery_id=r["delivery_id"],
                discrepancy_id=r["discrepancy_id"],
                filename=r["filename"],
                uploaded_at=datetime.fromisoformat(r["uploaded_at"]),
            )
            for r in rows
        ]

    def get_photo(self, photo_id: str) -> Photo | None:
        row = self.conn.execute(
            "SELECT * FROM photos WHERE id = ?", (photo_id,)
        ).fetchone()
        if not row:
            return None
        return Photo(
            id=row["id"], delivery_id=row["delivery_id"],
            discrepancy_id=row["discrepancy_id"], filename=row["filename"],
            uploaded_at=datetime.fromisoformat(row["uploaded_at"]),
        )
