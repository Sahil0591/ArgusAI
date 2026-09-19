import clsx from "clsx";
import { describeEvent, eventTone, TONE_DOT_CLASS } from "@/lib/event-copy";
import type { StreamEvent } from "@/lib/types";

export function TranscriptPanel({ events }: { events: StreamEvent[] }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border bg-surface-secondary px-4 py-2 text-sm font-medium text-muted-foreground">
        Live transcript
      </div>
      <ul className="max-h-64 space-y-1.5 overflow-y-auto px-4 py-3 text-sm">
        {events.length === 0 && <li className="text-muted-foreground/70">Nothing logged yet.</li>}
        {events
          .slice()
          .reverse()
          .map((e) => (
            <li key={e.event_id} className="flex items-start gap-2 text-foreground/90">
              <span className={clsx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT_CLASS[eventTone(e)])} />
              {describeEvent(e)}
            </li>
          ))}
      </ul>
    </div>
  );
}
