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
    <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
      <div className="border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-sm font-medium text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
        PO {poNumber} &middot; {vendorName}
      </div>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
        {lines.map((line) => {
          const hasDamage = line.discrepancies.some((d) => d.type === "damage");
          const complete = line.received_qty >= line.ordered_qty;
          return (
            <li key={line.po_line} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-zinc-900 dark:text-zinc-100">{line.material_description}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">{line.material_number}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {hasDamage && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    damage
                  </span>
                )}
                <span
                  className={clsx(
                    "text-sm font-medium tabular-nums",
                    complete ? "text-green-600 dark:text-green-400" : "text-zinc-500 dark:text-zinc-400"
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
