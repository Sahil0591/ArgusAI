"use client";

import { AnimatePresence, motion } from "framer-motion";
import clsx from "clsx";
import { describeEvent, eventTone, TONE_DOT_CLASS } from "@/lib/event-copy";
import type { StreamEvent } from "@/lib/types";

export function LiveFeed({ events }: { events: StreamEvent[] }) {
  const recent = events.slice(-30).slice().reverse();

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-surface">
      <div className="border-b border-border bg-surface-secondary px-4 py-2 text-sm font-medium text-muted-foreground">
        Live feed
      </div>
      <ul className="max-h-80 overflow-y-auto px-4 py-3 text-sm">
        {recent.length === 0 && <li className="text-muted-foreground/70">No activity yet.</li>}
        <AnimatePresence initial={false}>
          {recent.map((e) => (
            <motion.li
              key={e.event_id}
              layout
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 py-1 text-foreground/90"
            >
              <span className={clsx("h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT_CLASS[eventTone(e)])} />
              <span className="truncate">{describeEvent(e)}</span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}
