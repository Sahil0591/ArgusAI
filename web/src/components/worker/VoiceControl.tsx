"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { GeminiLiveSession, type VoiceState } from "@/lib/voice/gemini-live-client";

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Tap to talk",
  connecting: "Connecting\u2026",
  listening: "Listening \u2014 tap to stop",
  error: "Error \u2014 tap to retry",
};

function MicIcon({ small }: { small?: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={small ? "h-6 w-6" : "h-8 w-8"}>
      <path d="M10 12a3 3 0 003-3V5a3 3 0 10-6 0v4a3 3 0 003 3z" />
      <path d="M5.5 9a.75.75 0 00-1.5 0 6 6 0 005.25 5.955V17H7a.75.75 0 000 1.5h6a.75.75 0 000-1.5h-2.25v-2.045A6 6 0 0016 9a.75.75 0 00-1.5 0 4.5 4.5 0 01-9 0z" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <rect x="4" y="4" width="12" height="12" rx="2" />
    </svg>
  );
}

export function VoiceControl({
  deliveryId,
  onSpeech,
  onPhotoRequested,
  onSessionReady,
}: {
  deliveryId: string;
  onSpeech: (text: string) => void;
  onPhotoRequested: (discrepancyId: string, material: string) => void;
  onSessionReady: (session: GeminiLiveSession | null) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<GeminiLiveSession | null>(null);

  useEffect(() => {
    return () => {
      sessionRef.current?.stop();
      onSessionReady(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = async () => {
    setError(null);
    const session = new GeminiLiveSession(deliveryId, {
      onStateChange: setState,
      onSpeech,
      onPhotoRequested,
      onError: setError,
    });
    sessionRef.current = session;
    onSessionReady(session);
    await session.start();
  };

  const handleStop = () => {
    sessionRef.current?.stop();
    sessionRef.current = null;
    onSessionReady(null);
  };

  const active = state === "listening" || state === "connecting";

  const micButtonColor = clsx(
    state === "listening"
      ? "bg-red-600 text-white"
      : state === "error"
        ? "bg-amber-600 text-white"
        : "bg-accent text-accent-foreground"
  );

  return (
    <>
      {/* Mobile: sticky bottom bar */}
      <div
        className={clsx(
          "md:hidden",
          "sticky bottom-0 z-40",
          "border-t border-border bg-surface/95 backdrop-blur-sm",
          "px-4 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom,0px))]"
        )}
      >
        <div className="flex items-center gap-3">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
            {state === "listening" && (
              <motion.span
                className="absolute inset-0 rounded-full bg-red-600"
                animate={{ scale: [1, 1.6], opacity: [0.35, 0] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
              />
            )}
            <motion.button
              onClick={active ? handleStop : handleStart}
              aria-label={STATE_LABEL[state]}
              animate={state === "connecting" ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
              transition={state === "connecting" ? { duration: 1.2, repeat: Infinity } : undefined}
              className={clsx(
                "relative flex h-14 w-14 items-center justify-center rounded-full transition-colors",
                micButtonColor
              )}
            >
              <MicIcon small />
            </motion.button>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-muted-foreground">{STATE_LABEL[state]}</p>
            {error && <p className="truncate text-xs text-danger">{error}</p>}
          </div>

          {active && (
            <button
              type="button"
              onClick={handleStop}
              aria-label="Stop"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border bg-surface-secondary text-muted-foreground transition-colors hover:text-danger active:scale-95"
            >
              <StopIcon />
            </button>
          )}
        </div>
      </div>

      {/* Desktop: centered card */}
      <div className="hidden md:flex flex-col items-center gap-3 rounded-lg border border-border bg-surface py-8">
        <div className="relative flex h-20 w-20 items-center justify-center">
          {state === "listening" && (
            <motion.span
              className="absolute inset-0 rounded-full bg-red-600"
              animate={{ scale: [1, 1.6], opacity: [0.35, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
            />
          )}
          <motion.button
            onClick={active ? handleStop : handleStart}
            aria-label={STATE_LABEL[state]}
            animate={state === "connecting" ? { opacity: [1, 0.5, 1] } : { opacity: 1 }}
            transition={state === "connecting" ? { duration: 1.2, repeat: Infinity } : undefined}
            className={clsx(
              "relative flex h-20 w-20 items-center justify-center rounded-full transition-colors",
              micButtonColor
            )}
          >
            <MicIcon />
          </motion.button>
        </div>
        <p className="text-sm text-muted-foreground">{STATE_LABEL[state]}</p>
        {error && <p className="text-xs text-danger">{error}</p>}
      </div>
    </>
  );
}
