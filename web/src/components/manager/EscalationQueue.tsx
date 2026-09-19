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
        <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Needs decision ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="text-sm text-zinc-400 dark:text-zinc-500">No escalations pending — all clear.</p>
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
          <h2 className="mb-2 text-sm font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
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
