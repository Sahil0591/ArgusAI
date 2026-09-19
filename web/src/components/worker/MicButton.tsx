"use client";

import { useState, type FormEvent } from "react";

export interface LogLineInput {
  material_description: string;
  quantity: number;
  unit_of_measure: string;
  damage_noted?: string;
  pallet_number?: number;
}

const UNITS = ["EA", "CTN", "PAL", "PC", "PKG"];
const inputClass = "rounded-lg border border-border bg-canvas px-3 py-2 text-sm text-foreground";

// Manual entry — the fallback path when voice isn't available or a demo
// needs a guaranteed-working alternative (see VoiceControl for the primary
// tap-to-talk flow).
export function MicButton({ onSubmit }: { onSubmit: (input: LogLineInput) => Promise<void> }) {
  const [description, setDescription] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState(UNITS[0]);
  const [pallet, setPallet] = useState("");
  const [damage, setDamage] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
        pallet_number: pallet ? Number(pallet) : undefined,
      });
      setDescription("");
      setQuantity("");
      setDamage("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border bg-surface p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Manual entry</div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <input
          className={`col-span-2 ${inputClass}`}
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
      <div className="grid grid-cols-2 gap-2">
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
      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-opacity disabled:opacity-50"
      >
        {submitting ? "Logging…" : "Log line"}
      </button>
    </form>
  );
}
