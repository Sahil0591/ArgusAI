"use client";

import { useState, type FormEvent } from "react";

export interface LogLineInput {
  material_description: string;
  quantity: number;
  unit_of_measure: string;
  damage_noted?: string;
  line_status?: "received" | "missing";
  pallet_number?: number;
}

const UNITS = ["EA", "CTN", "PAL", "PC", "PKG"];
const inputClass = "w-full rounded-lg border border-border bg-canvas px-3 py-3 text-sm text-foreground";

export function MicButton({ onSubmit }: { onSubmit: (input: LogLineInput) => Promise<void> }) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const [pallet, setPallet] = useState("");
  const [damage, setDamage] = useState("");
  const [lineStatus, setLineStatus] = useState<"received" | "missing">("received");
  const [submitting, setSubmitting] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!description.trim() || !quantity) return;
    setSubmitting(true);
    try {
      await onSubmit({
        material_description: description.trim(),
        quantity: Number(quantity),
        unit_of_measure: unit,
        damage_noted: damage.trim() || undefined,
        line_status: lineStatus,
        pallet_number: pallet ? Number(pallet) : undefined,
      });
      setDescription("");
      setQuantity("");
      setDamage("");
      setLineStatus("received");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Manual entry</div>
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
          aria-label={collapsed ? "Expand" : "Collapse"}
        >
          <svg
            viewBox="0 0 20 20"
            fill="currentColor"
            className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-180"}`}
          >
            <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <>
          {/* Material + Qty + Unit */}
          <div className="flex flex-col gap-2 md:grid md:grid-cols-4">
            <input
              className={`${inputClass} md:col-span-2`}
              placeholder="Material, e.g. M8 bolts"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Qty"
              type="number"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <select className={inputClass} value={unit} onChange={(e) => setUnit(e.target.value)}>
              {UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>

          {/* Pallet + Damage */}
          <div className="flex flex-col gap-2 md:grid md:grid-cols-2">
            <input
              className={inputClass}
              placeholder="Pallet #"
              type="number"
              min="0"
              value={pallet}
              onChange={(e) => setPallet(e.target.value)}
            />
            <input
              className={inputClass}
              placeholder="Damage noted (optional)"
              value={damage}
              onChange={(e) => setDamage(e.target.value)}
            />
          </div>

          {/* Status */}
          <select className={inputClass} value={lineStatus} onChange={(e) => setLineStatus(e.target.value as "received" | "missing")}>
            <option value="received">Received</option>
            <option value="missing">Missing</option>
          </select>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-accent px-4 py-3 text-base font-semibold text-accent-foreground transition-opacity active:opacity-80 disabled:opacity-50"
          >
            {submitting ? "Logging\u2026" : "Log line"}
          </button>
        </>
      )}
    </form>
  );
}
