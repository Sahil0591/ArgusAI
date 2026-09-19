// Shared human-readable description + visual tone for a stream event.
// Used by both the worker transcript panel and the dashboard live feed so
// the two stay in sync instead of duplicating a switch statement.

import type {
  AssessmentCompleteEventData,
  DamageReportedEventData,
  DeliveryClosedEventData,
  EscalationDecidedEventData,
  LineLoggedEventData,
  PolicyDecisionEventData,
  StreamEvent,
} from "./types";

export type EventTone = "neutral" | "success" | "warning" | "danger";

// Small solid-fill indicator dots don't have the text-contrast constraint
// solid-fill buttons do, so the adaptive semantic tokens are safe here —
// one source of truth for the success/warning/danger hue identity.
export const TONE_DOT_CLASS: Record<EventTone, string> = {
  neutral: "bg-muted-foreground/40",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export function describeEvent(event: StreamEvent): string {
  switch (event.type) {
    case "line_logged": {
      const payload = event.payload as LineLoggedEventData;
      return payload.po_line
        ? `Logged ${payload.this_qty} ${payload.unit_of_measure} of ${payload.material_description}`
        : `Unmatched line — logged for review${payload.error ? `: ${payload.error}` : ""}`;
    }
    case "damage_reported": {
      const payload = event.payload as DamageReportedEventData;
      return `Damage noted on ${payload.material_description}: ${payload.discrepancy.damage_description}`;
    }
    case "photo_uploaded":
      return "Photo uploaded";
    case "assessment_complete": {
      const payload = event.payload as AssessmentCompleteEventData;
      return payload.assessment
        ? `Assessment complete — severity ${payload.assessment.severity}, confidence ${payload.assessment.confidence.toFixed(2)}`
        : "Vision assessment failed — flagged for review";
    }
    case "policy_decision": {
      const payload = event.payload as PolicyDecisionEventData;
      return `Decision: ${payload.decision.replace(/_/g, " ")}`;
    }
    case "escalation_created":
      return "Escalated to manager";
    case "escalation_decided": {
      const payload = event.payload as EscalationDecidedEventData;
      return `Manager ${payload.decision} the item`;
    }
    case "delivery_closed": {
      const payload = event.payload as DeliveryClosedEventData;
      return `Pallet ${payload.pallet_number} closed (${payload.line_count} items)`;
    }
    default:
      return event.type;
  }
}

export function eventTone(event: StreamEvent): EventTone {
  switch (event.type) {
    case "line_logged": {
      const payload = event.payload as LineLoggedEventData;
      return payload.po_line ? "success" : "warning";
    }
    case "damage_reported":
      return "warning";
    case "policy_decision": {
      const payload = event.payload as PolicyDecisionEventData;
      return payload.decision === "escalate" ? "danger" : "success";
    }
    case "escalation_created":
      return "danger";
    case "escalation_decided": {
      const payload = event.payload as EscalationDecidedEventData;
      return payload.decision === "accepted" ? "success" : "warning";
    }
    default:
      return "neutral";
  }
}
