// The real backend only exposes a raw event log per delivery (GET
// /deliveries/{id}) and lean escalations (GET /escalations) — it never
// returns structured receipt lines or enriched escalation objects. These
// functions reduce events into the view-models the UI actually wants.

import { getPO } from "./po-catalog";
import type {
  AssessmentCompleteEventData,
  AssessmentFeedItem,
  DamageReportedEventData,
  Discrepancy,
  DeliveryEvent,
  Escalation,
  EscalationView,
  LineLoggedEventData,
  PhotoUploadedEventData,
  PolicyDecisionEventData,
  ReceiptLineView,
  DeliveryReport,
} from "./types";

export function deriveReceiptLines(po_number: string, events: DeliveryEvent[]): ReceiptLineView[] {
  const po = getPO(po_number);
  if (!po) return [];

  const lines = new Map<string, ReceiptLineView>(
    po.lines.map((l) => [
      l.EBELP,
      {
        po_line: l.EBELP,
        material_number: l.MATNR,
        material_description: l.MAKTX,
        ordered_qty: l.MENGE,
        received_qty: 0,
        missing_qty: 0,
        unit_of_measure: l.MEINS,
        discrepancies: [],
      },
    ])
  );

  const seenDiscrepancyIds = new Set<string>();
  const addDiscrepancy = (poLine: string | undefined, disc: Discrepancy) => {
    if (seenDiscrepancyIds.has(disc.id)) return;
    const target = poLine ? lines.get(poLine) : undefined;
    if (target) {
      target.discrepancies.push(disc);
      seenDiscrepancyIds.add(disc.id);
    }
  };

  for (const event of events) {
    if (event.type === "line_logged") {
      const data = event.data as unknown as LineLoggedEventData;
      if (!data.po_line) {
        const key = `unmatched:${event.id}`;
        lines.set(key, {
          po_line: key,
          material_number: data.material_number ?? "UNMATCHED",
          material_description: data.material_description || "Unmatched item",
          ordered_qty: 0,
          received_qty: data.line_status === "missing" ? 0 : data.this_qty,
          missing_qty: data.line_status === "missing" ? data.this_qty : 0,
          unit_of_measure: data.unit_of_measure ?? "EA",
          discrepancies: [],
          unmatched: true,
        });
        continue;
      }
      const line = lines.get(data.po_line);
      if (line) {
        if (data.line_status === "missing") {
          line.missing_qty += data.missing_qty ?? data.this_qty;
        } else {
          line.received_qty = data.received_qty;
        }
        line.material_description = data.material_description ?? line.material_description;
        line.unit_of_measure = data.unit_of_measure ?? line.unit_of_measure;
      }
      for (const disc of data.discrepancies ?? []) {
        addDiscrepancy(data.po_line, disc);
      }
    } else if (event.type === "damage_reported") {
      const data = event.data as unknown as DamageReportedEventData;
      const matchedLine = [...lines.values()].find((l) => l.material_number === data.material_number);
      addDiscrepancy(matchedLine?.po_line, data.discrepancy);
    }
  }

  return [...lines.values()];
}

export function deriveDeliveryReport(
  delivery_id: string,
  po_number: string,
  status: DeliveryReport["status"],
  lines: ReceiptLineView[],
  events: DeliveryEvent[],
): DeliveryReport {
  const damaged = new Set<string>();
  let damagedUnits = 0;
  let pendingEscalations = 0;
  let resolvedEscalations = 0;

  for (const event of events) {
    if (event.type === "damage_reported") {
      const data = event.data as unknown as DamageReportedEventData;
      if (!damaged.has(data.discrepancy.id)) {
        damaged.add(data.discrepancy.id);
        damagedUnits += data.discrepancy.actual_qty ?? 0;
      }
    }
    if (event.type === "escalation_created") pendingEscalations += 1;
    if (event.type === "escalation_decided") {
      pendingEscalations = Math.max(0, pendingEscalations - 1);
      resolvedEscalations += 1;
    }
  }

  return {
    delivery_id,
    po_number,
    status,
    ordered_units: lines.reduce((sum, line) => sum + line.ordered_qty, 0),
    received_units: lines.reduce((sum, line) => sum + line.received_qty, 0),
    missing_units: lines.reduce((sum, line) => sum + Math.max(line.ordered_qty - line.received_qty, 0), 0),
    missing_lines: lines.filter((line) => line.received_qty < line.ordered_qty).length,
    damaged_units: damagedUnits,
    damaged_lines: damaged.size,
    overage_units: lines.reduce((sum, line) => sum + Math.max(line.received_qty - line.ordered_qty, 0), 0),
    pending_escalations: pendingEscalations,
    resolved_escalations: resolvedEscalations,
  };
}

interface EnrichmentMaps {
  material: Map<string, string>;
  discrepancy: Map<string, Discrepancy>;
  assessment: Map<string, AssessmentCompleteEventData["assessment"]>;
  policy: Map<string, PolicyDecisionEventData>;
  photo: Map<string, string>;
}

export function buildEnrichmentMaps(events: DeliveryEvent[]): EnrichmentMaps {
  const maps: EnrichmentMaps = {
    material: new Map(),
    discrepancy: new Map(),
    assessment: new Map(),
    policy: new Map(),
    photo: new Map(),
  };

  for (const event of events) {
    if (event.type === "line_logged") {
      const data = event.data as unknown as LineLoggedEventData;
      for (const disc of data.discrepancies ?? []) {
        maps.discrepancy.set(disc.id, disc);
        maps.material.set(disc.id, data.material_description);
      }
    } else if (event.type === "damage_reported") {
      const data = event.data as unknown as DamageReportedEventData;
      maps.discrepancy.set(data.discrepancy.id, data.discrepancy);
      maps.material.set(data.discrepancy.id, data.material_description);
    } else if (event.type === "photo_uploaded") {
      const data = event.data as unknown as PhotoUploadedEventData;
      maps.photo.set(data.discrepancy_id, data.photo_id);
    } else if (event.type === "assessment_complete") {
      const data = event.data as unknown as AssessmentCompleteEventData;
      maps.assessment.set(data.discrepancy_id, data.assessment);
    } else if (event.type === "policy_decision") {
      const data = event.data as unknown as PolicyDecisionEventData;
      maps.policy.set(data.discrepancy_id, data);
    }
  }

  return maps;
}

// Tracks each discrepancy's resolution lifecycle for the dashboard's
// parallel assessment grid. Damage goes "assessing" from photo_uploaded
// until a policy_decision lands, then "resolved". Overage has no photo
// step (it's a deterministic policy call made inline in log_line) so it
// jumps straight to "resolved" the moment its policy_decision arrives.
// Multiple discrepancies naturally interleave here when several are in
// flight at once (e.g. during a scripted simulator run), which is the point.
export function deriveAssessmentFeed(delivery_id: string, events: DeliveryEvent[]): AssessmentFeedItem[] {
  const maps = buildEnrichmentMaps(events);
  const items = new Map<string, AssessmentFeedItem>();

  for (const event of events) {
    if (event.type === "photo_uploaded") {
      const data = event.data as unknown as PhotoUploadedEventData;
      if (!items.has(data.discrepancy_id)) {
        items.set(data.discrepancy_id, {
          discrepancy_id: data.discrepancy_id,
          delivery_id,
          material_description: maps.material.get(data.discrepancy_id) ?? "Unknown item",
          status: "assessing",
          assessment: null,
          decision: null,
        });
      }
    } else if (event.type === "policy_decision") {
      const data = event.data as unknown as PolicyDecisionEventData;
      const existing = items.get(data.discrepancy_id);
      items.set(data.discrepancy_id, {
        discrepancy_id: data.discrepancy_id,
        delivery_id,
        material_description: existing?.material_description ?? maps.material.get(data.discrepancy_id) ?? "Unknown item",
        status: "resolved",
        assessment: maps.assessment.get(data.discrepancy_id) ?? null,
        decision: { decision: data.decision, reason: data.reason, claim: data.claim },
      });
    }
  }

  return [...items.values()];
}

// Enrich escalations using the event history of the deliveries they belong
// to. `eventsByDeliveryId` only needs entries for deliveries that actually
// have escalations.
export function enrichEscalations(
  escalations: Escalation[],
  eventsByDeliveryId: Record<string, DeliveryEvent[]>
): EscalationView[] {
  const mapsByDelivery = new Map<string, EnrichmentMaps>();

  return escalations.map((esc) => {
    let maps = mapsByDelivery.get(esc.delivery_id);
    if (!maps) {
      maps = buildEnrichmentMaps(eventsByDeliveryId[esc.delivery_id] ?? []);
      mapsByDelivery.set(esc.delivery_id, maps);
    }

    const policyData = maps.policy.get(esc.discrepancy_id);

    return {
      ...esc,
      material_description: maps.material.get(esc.discrepancy_id) ?? "Unknown item",
      discrepancy: maps.discrepancy.get(esc.discrepancy_id) ?? null,
      damage_assessment: maps.assessment.get(esc.discrepancy_id) ?? null,
      policy_decision: policyData
        ? { decision: policyData.decision, reason: policyData.reason, claim: policyData.claim }
        : null,
      photo_id: maps.photo.get(esc.discrepancy_id) ?? null,
    };
  });
}
