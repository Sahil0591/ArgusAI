import clsx from "clsx";
import type { ReceiptLineView } from "@/lib/types";

export function POChecklist({
  poNumber,
  vendorName,
  lines,
}: {
  poNumber: string;
  vendorName: string;
  lines: ReceiptLineView[];
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border bg-surface-secondary px-4 py-2 text-sm font-medium text-muted-foreground">
        PO <span className="font-mono">{poNumber}</span> &middot; {vendorName}
      </div>
      <ul className="divide-y divide-border">
        {lines.map((line) => {
          const hasDamage = line.discrepancies.some((d) => d.type === "damage");
          const complete = line.received_qty >= line.ordered_qty;
          const matched = complete && !hasDamage;
          return (
            <li key={line.po_line} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{line.material_description}</div>
                <div className="font-mono text-xs text-muted-foreground">{line.material_number}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {hasDamage && (
                  <span className="rounded-full border border-warning-border bg-warning-bg px-2 py-0.5 text-xs font-medium text-warning">
                    damage
                  </span>
                )}
                {matched && (
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 text-success" aria-label="Matched">
                    <path
                      fillRule="evenodd"
                      d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.415 0l-3.5-3.5a1 1 0 111.415-1.415L8.5 12.086l6.79-6.796a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
                <span
                  className={clsx(
                    "font-mono text-sm font-medium tabular-nums",
                    complete ? "text-success" : "text-muted-foreground"
                  )}
                >
                  {line.received_qty} / {line.ordered_qty} {line.unit_of_measure}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
