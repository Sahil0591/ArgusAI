"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { motion } from "framer-motion";

type CameraState = "starting" | "live" | "unavailable" | "uploading";

function CameraIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
      <path d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" />
    </svg>
  );
}

// Opens the device camera directly (getUserMedia + live preview + shutter)
// rather than delegating to a file-picker's `capture` hint, which on
// desktop just opens a plain file dialog and on mobile still lets the user
// wander into the gallery. Upload stays available as an explicit fallback
// for when the camera is denied, unavailable, or the clerk just has an
// existing photo to use instead.
export function PhotoCapture({
  material,
  onCapture,
}: {
  material: string;
  onCapture: (photo: Blob) => Promise<void>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<CameraState>("starting");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setState("live");
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setError(err.message);
        setState("unavailable");
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const capture = () => {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0);
    setState("uploading");
    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setState("live");
          return;
        }
        try {
          await onCapture(blob);
        } finally {
          stopCamera();
        }
      },
      "image/jpeg",
      0.9
    );
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setState("uploading");
    try {
      await onCapture(file);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
      stopCamera();
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-warning-border bg-warning-bg p-4 text-center"
    >
      <p className="text-sm font-medium text-warning">Damage flagged on {material} &mdash; take a photo to continue</p>

      {/* Always mounted (never conditionally rendered) so the ref exists
          the moment getUserMedia resolves — gating this behind state
          "live" meant the stream had nowhere to attach to, and every
          capture silently no-op'd on a permanently-zero videoWidth. */}
      <div
        hidden={state === "unavailable"}
        className="relative w-full max-w-xs overflow-hidden rounded-lg bg-black"
      >
        <video ref={videoRef} autoPlay playsInline muted className="aspect-4/3 w-full object-cover" />
        {state === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm font-medium text-white">
            <CameraIcon />
            Starting camera…
          </div>
        )}
        {state === "uploading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white">
            Analyzing…
          </div>
        )}
      </div>

      {state === "unavailable" && (
        <p className="text-xs text-muted-foreground">Camera unavailable{error ? `: ${error}` : ""} — use upload below.</p>
      )}

      <div className="flex items-center gap-3">
        {state === "live" && (
          <button onClick={capture} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-foreground">
            Capture
          </button>
        )}
        <label className="cursor-pointer text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground has-disabled:opacity-50">
          {state === "unavailable" ? "Upload photo" : "Upload instead"}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={state === "uploading"}
            className="sr-only"
          />
        </label>
      </div>
    </motion.div>
  );
}
