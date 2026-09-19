from __future__ import annotations

import json
import sqlite3
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import unquote

from backend import config
from backend.models import (
    Delivery, DeliveryStatus, Escalation, EscalationStatus,
    Event, EventType, Photo,
)


class Store:
    """Thin wrapper around SQL storage for the append-only event log and entities."""

    def __init__(self, db_path: str | None = None, *, database_url: str | None = None):
        if database_url is None:
            if db_path is None:
                database_url = config.database_url_for_runtime()
            elif db_path == ":memory:":
                database_url = "sqlite:///:memory:"
            elif "://" in db_path:
                database_url = db_path
            else:
                database_url = f"sqlite:///{db_path}"

        self.database_url = database_url
        self.dialect = self._detect_dialect(database_url)
        self.db_path = self._sqlite_path(database_url) if self.dialect == "sqlite" else None
        self._conn: Any | None = None

    @staticmethod
    def _detect_dialect(database_url: str) -> str:
        normalized = database_url.lower()
        if normalized.startswith("sqlite:"):
            return "sqlite"
        if normalized.startswith(("postgresql://", "postgres://", "postgresql+psycopg://")):
            return "postgres"
        raise ValueError(f"Unsupported DATABASE_URL scheme: {database_url!r}")

    @staticmethod
    def _sqlite_path(database_url: str) -> str:
        if database_url in {"sqlite:///:memory:", "sqlite:///:memory"}:
            return ":memory:"
        if not database_url.startswith("sqlite:///"):
            raise ValueError(f"Unsupported SQLite URL: {database_url!r}")
        return unquote(database_url.removeprefix("sqlite:///"))

    @property
    def conn(self) -> Any:
        if self._conn is None:
            if self.dialect == "sqlite":
                if self.db_path != ":memory:":
                    Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
                self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
                self._conn.row_factory = sqlite3.Row
                self._conn.execute("PRAGMA journal_mode=WAL")
                self._conn.execute("PRAGMA foreign_keys=ON")
            else:
                try:
                    import psycopg
                    from psycopg.rows import dict_row
                except ImportError as exc:
                    raise RuntimeError(
                        "PostgreSQL DATABASE_URL requires the psycopg package. "
                        "Install with `uv add \"psycopg[binary]\"`."
                    ) from exc

                postgres_url = self.database_url.replace("postgresql+psycopg://", "postgresql://", 1)
                self._conn = psycopg.connect(postgres_url, row_factory=dict_row)
        return self._conn

    def _sql(self, statement: str) -> str:
        if self.dialect == "sqlite":
            return statement
        return statement.replace("?", "%s")

    def _execute(self, statement: str, params: tuple[Any, ...] = ()):
        return self.conn.execute(self._sql(statement), params)

    def _fetchone(self, statement: str, params: tuple[Any, ...] = ()):
        return self._execute(statement, params).fetchone()

    def _fetchall(self, statement: str, params: tuple[Any, ...] = ()):
        return self._execute(statement, params).fetchall()

    @staticmethod
    def _parse_datetime(value: Any) -> datetime:
        if isinstance(value, datetime):
            return value
        return datetime.fromisoformat(str(value))

    def init_db(self) -> None:
        """Create tables if they don't exist."""
        if self.dialect == "sqlite":
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
            return

        for statement in (
            """
            CREATE TABLE IF NOT EXISTS events (
                id BIGSERIAL PRIMARY KEY,
                delivery_id TEXT NOT NULL,
                timestamp TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
                type TEXT NOT NULL,
                data TEXT NOT NULL DEFAULT '{}',
                needs_review BOOLEAN NOT NULL DEFAULT FALSE
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS deliveries (
                id TEXT PRIMARY KEY,
                po_number TEXT NOT NULL,
                vendor_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'in_progress',
                started_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text),
                completed_at TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS escalations (
                id TEXT PRIMARY KEY,
                delivery_id TEXT NOT NULL,
                discrepancy_id TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                decided_at TEXT,
                decided_by TEXT
            )
            """,
            """
            CREATE TABLE IF NOT EXISTS photos (
                id TEXT PRIMARY KEY,
                delivery_id TEXT NOT NULL,
                discrepancy_id TEXT NOT NULL,
                filename TEXT NOT NULL,
                uploaded_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP::text)
            )
            """,
        ):
            self.conn.execute(statement)
        self.conn.commit()

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    # --- Events (append-only) ---

    def add_event(self, event: Event) -> Event:
        """Insert an event and return it with its assigned id."""
        params = (
            event.delivery_id,
            event.timestamp.isoformat(),
            event.type.value,
            json.dumps(event.data),
            event.needs_review,
        )
        if self.dialect == "postgres":
            cur = self._execute(
                "INSERT INTO events (delivery_id, timestamp, type, data, needs_review) "
                "VALUES (?, ?, ?, ?, ?) RETURNING id",
                params,
            )
            event.id = cur.fetchone()["id"]
        else:
            cur = self._execute(
                "INSERT INTO events (delivery_id, timestamp, type, data, needs_review) VALUES (?, ?, ?, ?, ?)",
                params,
            )
            event.id = cur.lastrowid
        self.conn.commit()
        return event

    def get_events(self, delivery_id: str) -> list[Event]:
        rows = self._fetchall(
            "SELECT * FROM events WHERE delivery_id = ? ORDER BY id", (delivery_id,)
        )
        return [self._row_to_event(r) for r in rows]

    def get_events_since(self, since_id: int = 0) -> list[Event]:
        """Get all events with id > since_id, across all deliveries."""
        rows = self._fetchall(
            "SELECT * FROM events WHERE id > ? ORDER BY id", (since_id,)
        )
        return [self._row_to_event(r) for r in rows]

    def _row_to_event(self, row: sqlite3.Row) -> Event:
        return Event(
            id=row["id"],
            delivery_id=row["delivery_id"],
            timestamp=self._parse_datetime(row["timestamp"]),
            type=EventType(row["type"]),
            data=json.loads(row["data"]),
            needs_review=bool(row["needs_review"]),
        )

    # --- Deliveries ---

    def create_delivery(self, delivery: Delivery) -> Delivery:
        self._execute(
            "INSERT INTO deliveries (id, po_number, vendor_id, status, started_at) VALUES (?, ?, ?, ?, ?)",
            (delivery.id, delivery.po_number, delivery.vendor_id,
             delivery.status.value, delivery.started_at.isoformat()),
        )
        self.conn.commit()
        return delivery

    def get_delivery(self, delivery_id: str) -> Delivery | None:
        row = self._fetchone(
            "SELECT * FROM deliveries WHERE id = ?", (delivery_id,)
        )
        if not row:
            return None
        return Delivery(
            id=row["id"], po_number=row["po_number"], vendor_id=row["vendor_id"],
            status=DeliveryStatus(row["status"]),
            started_at=self._parse_datetime(row["started_at"]),
            completed_at=self._parse_datetime(row["completed_at"]) if row["completed_at"] else None,
        )

    def list_deliveries(self) -> list[Delivery]:
        rows = self._fetchall("SELECT * FROM deliveries ORDER BY started_at DESC")
        return [
            Delivery(
                id=r["id"], po_number=r["po_number"], vendor_id=r["vendor_id"],
                status=DeliveryStatus(r["status"]),
                started_at=self._parse_datetime(r["started_at"]),
                completed_at=self._parse_datetime(r["completed_at"]) if r["completed_at"] else None,
            )
            for r in rows
        ]

    def complete_delivery(self, delivery_id: str) -> None:
        self._execute(
            "UPDATE deliveries SET status = ?, completed_at = ? WHERE id = ?",
            (DeliveryStatus.COMPLETED.value, datetime.now(UTC).isoformat(), delivery_id),
        )
        self.conn.commit()

    # --- Escalations ---

    def create_escalation(self, esc: Escalation) -> Escalation:
        self._execute(
            "INSERT INTO escalations (id, delivery_id, discrepancy_id, status) VALUES (?, ?, ?, ?)",
            (esc.id, esc.delivery_id, esc.discrepancy_id, esc.status.value),
        )
        self.conn.commit()
        return esc

    def get_escalation(self, escalation_id: str) -> Escalation | None:
        row = self._fetchone(
            "SELECT * FROM escalations WHERE id = ?", (escalation_id,)
        )
        if not row:
            return None
        return Escalation(
            id=row["id"], delivery_id=row["delivery_id"],
            discrepancy_id=row["discrepancy_id"],
            status=EscalationStatus(row["status"]),
            decided_at=self._parse_datetime(row["decided_at"]) if row["decided_at"] else None,
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
        self._execute(
            "UPDATE escalations SET status = ?, decided_at = ?, decided_by = ? WHERE id = ?",
            (esc.status.value, esc.decided_at.isoformat(), esc.decided_by, esc.id),
        )
        self.conn.commit()
        return esc

    def list_escalations(self, delivery_id: str | None = None) -> list[Escalation]:
        if delivery_id:
            rows = self._fetchall(
                "SELECT * FROM escalations WHERE delivery_id = ?", (delivery_id,)
            )
        else:
            rows = self._fetchall("SELECT * FROM escalations")
        return [
            Escalation(
                id=r["id"], delivery_id=r["delivery_id"],
                discrepancy_id=r["discrepancy_id"],
                status=EscalationStatus(r["status"]),
                decided_at=self._parse_datetime(r["decided_at"]) if r["decided_at"] else None,
                decided_by=r["decided_by"],
            )
            for r in rows
        ]

    # --- Photos ---

    def add_photo(self, photo: Photo) -> Photo:
        self._execute(
            "INSERT INTO photos (id, delivery_id, discrepancy_id, filename, uploaded_at) VALUES (?, ?, ?, ?, ?)",
            (photo.id, photo.delivery_id, photo.discrepancy_id,
             photo.filename, photo.uploaded_at.isoformat()),
        )
        self.conn.commit()
        return photo

    def get_photos(self, discrepancy_id: str) -> list[Photo]:
        rows = self._fetchall(
            "SELECT * FROM photos WHERE discrepancy_id = ?", (discrepancy_id,)
        )
        return [
            Photo(
                id=r["id"], delivery_id=r["delivery_id"],
                discrepancy_id=r["discrepancy_id"],
                filename=r["filename"],
                uploaded_at=self._parse_datetime(r["uploaded_at"]),
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
