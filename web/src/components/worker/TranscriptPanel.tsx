import type {
  AssessmentCompleteEventData,
  DamageReportedEventData,
  DeliveryClosedEventData,
  EscalationDecidedEventData,
  LineLoggedEventData,
  PolicyDecisionEventData,
  StreamEvent,
} from "@/lib/types";

function describeEvent(event: StreamEvent): string {
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

export function TranscriptPanel({ events }: { events: StreamEvent[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        Live transcript
      </div>
      <ul className="max-h-64 space-y-1 overflow-y-auto px-4 py-3 text-sm">
        {events.length === 0 && <li className="text-zinc-400 dark:text-zinc-500">Nothing logged yet.</li>}
        {events
          .slice()
          .reverse()
          .map((e) => (
            <li key={e.event_id} className="text-zinc-700 dark:text-zinc-300">
              {describeEvent(e)}
            </li>
          ))}
      </ul>
    </div>
  );
}
