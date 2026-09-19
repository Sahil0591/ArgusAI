import type { DeliverySummary } from "@/lib/types";

export function DeliveryFilter({
  deliveries,
  value,
  onChange,
}: {
  deliveries: DeliverySummary[];
  value: string | "all";
  onChange: (value: string | "all") => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
    >
      <option value="all">All deliveries</option>
      {deliveries.map((d) => (
        <option key={d.id} value={d.id}>
          {d.po_number} &middot; {d.id.slice(0, 8)}
        </option>
      ))}
    </select>
  );
}
