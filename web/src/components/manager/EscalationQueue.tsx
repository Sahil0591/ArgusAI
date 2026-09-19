import clsx from "clsx";
import type { EscalationView } from "@/lib/types";
import { EscalationCard } from "./EscalationCard";

export function EscalationQueue({
  escalations,
  onDecide,
}: {
  escalations: EscalationView[];
  onDecide: (id: string, decision: "accepted" | "rejected") => Promise<void>;
}) {
  const pending = escalations.filter((e) => e.status === "pending");
  const decided = escalations.filter((e) => e.status !== "pending");

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Needs decision
          <span
            className={clsx(
              "rounded-full px-1.5 py-0.5 font-mono text-[11px] tabular-nums",
              pending.length > 0 ? "bg-warning-bg text-warning" : "bg-success-bg text-success"
            )}
          >
            {pending.length}
          </span>
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-muted-foreground">No escalations pending &mdash; all clear.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {pending.map((e) => (
              <EscalationCard key={e.id} escalation={e} onDecide={onDecide} />
            ))}
          </div>
        )}
      </div>

      {decided.length > 0 && (
        <div>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Decided ({decided.length})
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {decided.map((e) => (
              <EscalationCard key={e.id} escalation={e} onDecide={onDecide} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
