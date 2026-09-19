#!/usr/bin/env python
"""
Simulate a full truck delivery against the ArgusAI backend.

Covers:
1. Matching lines (normal receipt)
2. Small shortage (auto-accepted)
3. Low-value damage (auto-accepted with supplier claim)
4. High-value damage (escalated to manager)

Usage:
    python scripts/simulate_delivery.py [--base-url URL] [--auto-decide]

    --base-url   Backend URL (default: http://localhost:8000)
    --auto-decide  Auto-accept the escalation so the script can run unattended
"""
from __future__ import annotations

import argparse
import sys
import time
from pathlib import Path

import httpx


def main():
    parser = argparse.ArgumentParser(description="ArgusAI delivery simulator")
    parser.add_argument("--base-url", default="http://localhost:8000", help="Backend URL")
    parser.add_argument("--auto-decide", action="store_true", help="Auto-accept escalations")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    client = httpx.Client(base_url=base, timeout=30)
    delivery_id = f"SIM-{int(time.time())}"

    print(f"\n{'='*60}")
    print(f"  ArgusAI Delivery Simulator")
    print(f"  Backend: {base}")
    print(f"  Delivery: {delivery_id}")
    print(f"{'='*60}\n")

    # Step 1: Start delivery
    print("[1] Starting delivery for PO-4500003...")
    r = client.post(f"/deliveries/{delivery_id}/start", json={"po_number": "PO-4500003"})
    assert r.status_code == 200, f"Failed: {r.text}"
    print(f"    -> {r.json()}\n")

    # Step 2: Log normal line - gaskets (full quantity, no damage)
    print("[2] Logging: 50 PTFE Spiral Wound Gaskets (full match)...")
    r = client.post("/tools/log_line", json={
        "delivery_id": delivery_id,
        "pallet_number": 1,
        "material_description": "PTFE spiral wound gasket",
        "quantity": 50,
        "unit_of_measure": "PC",
    })
    assert r.status_code == 200, f"Failed: {r.text}"
    print(f"    Voice: {r.json()['speech']}\n")

    # Step 3: Log line with small shortage - screws (199 of 200, 0.5% shortage -> auto-accept)
    print("[3] Logging: 199 M6 Pan Head Screws (shortage of 1, 0.5%)...")
    r = client.post("/tools/log_line", json={
        "delivery_id": delivery_id,
        "pallet_number": 1,
        "material_description": "M6 pan head machine screw",
        "quantity": 199,
        "unit_of_measure": "PKG",
    })
    assert r.status_code == 200, f"Failed: {r.text}"
    print(f"    Voice: {r.json()['speech']}\n")

    # Step 4: Close pallet 1
    print("[4] Closing pallet 1...")
    r = client.post("/tools/close_pallet", json={
        "delivery_id": delivery_id,
        "pallet_number": 1,
    })
    assert r.status_code == 200, f"Failed: {r.text}"
    print(f"    Voice: {r.json()['speech']}\n")

    # Step 5: Log damaged low-value screws (report damage separately)
    print("[5] Reporting damage: 3 M6 screws with crushed packaging (value ~17.70 EUR)...")
    r = client.post("/tools/report_damage", json={
        "delivery_id": delivery_id,
        "material_description": "M6 pan head machine screw",
        "description": "Crushed packaging, screws bent",
        "quantity": 3,
    })
    assert r.status_code == 200, f"Failed: {r.text}"
    disc_id_low = r.json()["discrepancy_id"]
    print(f"    Voice: {r.json()['speech']}")
    print(f"    Discrepancy ID: {disc_id_low}\n")

    # Step 6: Upload photo for low-value damage
    print("[6] Uploading damage photo for low-value screws...")
    photo_path = Path(__file__).parent.parent / "backend" / "seed" / "photos" / "sample_damage.jpg"
    with open(photo_path, "rb") as f:
        r = client.post("/photos",
            files={"file": ("damage_screws.jpg", f, "image/jpeg")},
            data={"delivery_id": delivery_id, "discrepancy_id": disc_id_low},
        )
    assert r.status_code == 200, f"Failed: {r.text}"
    data = r.json()
    print(f"    Voice: {data.get('speech', 'N/A')}")
    if data.get("decision"):
        print(f"    Decision: {data['decision']['decision']} - {data['decision']['reason']}")
        if data['decision'].get('claim'):
            print(f"    Claim amount: EUR {data['decision']['claim']['claimed_amount_eur']:.2f}")
    print()

    # Step 7: Log damaged high-value bearings
    print("[7] Reporting damage: 5 SKF bearings with cracked housing (value ~2245 EUR)...")
    r = client.post("/tools/report_damage", json={
        "delivery_id": delivery_id,
        "material_description": "SKF deep groove ball bearing",
        "description": "Cracked outer housing on 5 units, visible fractures",
        "quantity": 5,
    })
    assert r.status_code == 200, f"Failed: {r.text}"
    disc_id_high = r.json()["discrepancy_id"]
    print(f"    Voice: {r.json()['speech']}")
    print(f"    Discrepancy ID: {disc_id_high}\n")

    # Step 8: Upload photo for high-value damage
    print("[8] Uploading damage photo for bearings...")
    with open(photo_path, "rb") as f:
        r = client.post("/photos",
            files={"file": ("damage_bearings.jpg", f, "image/jpeg")},
            data={"delivery_id": delivery_id, "discrepancy_id": disc_id_high},
        )
    assert r.status_code == 200, f"Failed: {r.text}"
    data = r.json()
    print(f"    Voice: {data.get('speech', 'N/A')}")
    if data.get("decision"):
        print(f"    Decision: {data['decision']['decision']} - {data['decision']['reason']}")
    escalation_id = data.get("escalation_id")
    print(f"    Escalation ID: {escalation_id}\n")

    # Step 9: Check escalations
    print("[9] Checking escalations...")
    r = client.get(f"/escalations?delivery_id={delivery_id}")
    assert r.status_code == 200, f"Failed: {r.text}"
    escalations = r.json()
    print(f"    Found {len(escalations)} escalation(s)")
    for esc in escalations:
        print(f"    - {esc['id']}: {esc['status']}")
    print()

    # Step 10: Decide escalation (if auto-decide or we have an escalation)
    if escalation_id and args.auto_decide:
        print("[10] Auto-deciding escalation (accepting)...")
        r = client.post(f"/escalations/{escalation_id}/decision", json={
            "decision": "accepted",
            "decided_by": "manager",
        })
        assert r.status_code == 200, f"Failed: {r.text}"
        print(f"    Voice: {r.json()['speech']}\n")

        # Verify idempotency
        print("[10b] Testing idempotency (deciding again)...")
        r = client.post(f"/escalations/{escalation_id}/decision", json={
            "decision": "rejected",
            "decided_by": "other_manager",
        })
        assert r.status_code == 200, f"Failed: {r.text}"
        print(f"    Result: {r.json()['escalation']['status']} (should still be 'accepted')\n")
    elif escalation_id:
        print(f"[10] Escalation {escalation_id} pending - use --auto-decide to accept automatically")
        print(f"    Or: curl -X POST {base}/escalations/{escalation_id}/decision -H 'Content-Type: application/json' -d '{{\"decision\":\"accepted\",\"decided_by\":\"manager\"}}'\n")

    # Step 11: Log remaining bearings (15 of 20, the other 5 were damaged)
    print("[11] Logging: 15 SKF bearings (remaining good units)...")
    r = client.post("/tools/log_line", json={
        "delivery_id": delivery_id,
        "pallet_number": 2,
        "material_description": "SKF deep groove ball bearing",
        "quantity": 15,
        "unit_of_measure": "PC",
    })
    assert r.status_code == 200, f"Failed: {r.text}"
    print(f"    Voice: {r.json()['speech']}\n")

    # Step 12: Delivery status
    print("[12] Final delivery status...")
    r = client.get(f"/tools/delivery_status?delivery_id={delivery_id}")
    assert r.status_code == 200, f"Failed: {r.text}"
    status = r.json()
    print(f"    Voice: {status['speech']}")
    print(f"    Lines:")
    for line in status.get("lines", []):
        print(f"      {line['material']}: {line['received']:.0f}/{line['ordered']:.0f}")
    print()

    # Step 13: Get full delivery detail
    print("[13] Full delivery detail...")
    r = client.get(f"/deliveries/{delivery_id}")
    assert r.status_code == 200, f"Failed: {r.text}"
    detail = r.json()
    print(f"    Status: {detail['status']}")
    print(f"    Events: {len(detail['events'])}")
    for evt in detail["events"]:
        print(f"      [{evt['type']}] {evt.get('data', {}).get('material_description', evt.get('data', {}).get('reason', ''))}")

    print(f"\n{'='*60}")
    print(f"  Simulation complete!")
    print(f"  Delivery: {delivery_id}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
