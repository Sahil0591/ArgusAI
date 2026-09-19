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

function XIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

export function PhotoCapture({
  material,
  onCapture,
  onCancel,
}: {
  material: string;
  onCapture: (photo: Blob) => Promise<void>;
  onCancel?: () => void;
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

  const handleCancel = () => {
    stopCamera();
    onCancel?.();
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="flex flex-col gap-3 rounded-lg border-2 border-dashed border-warning-border bg-warning-bg p-4"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium text-warning">
          Damage flagged on {material} - take a photo to continue
        </p>
        {onCancel && (
          <button
            type="button"
            onClick={handleCancel}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Cancel"
          >
            <XIcon />
          </button>
        )}
      </div>

      <div
        hidden={state === "unavailable"}
        className="relative w-full md:max-w-md overflow-hidden rounded-lg bg-black"
      >
        <video ref={videoRef} autoPlay playsInline muted className="aspect-4/3 w-full object-cover" />
        {state === "starting" && (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-black/60 text-sm font-medium text-white">
            <CameraIcon />
            Starting camera...
          </div>
        )}
        {state === "uploading" && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-sm font-medium text-white">
            Analyzing...
          </div>
        )}
      </div>

      {state === "unavailable" && (
        <p className="text-xs text-muted-foreground">
          Camera unavailable{error ? `: ${error}` : ""} - use upload below.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {state === "live" && (
          <button
            onClick={capture}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent py-3 text-base font-semibold text-accent-foreground transition-opacity active:opacity-80"
          >
            <CameraIcon />
            Capture photo
          </button>
        )}
        <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-border bg-canvas py-3 text-sm font-medium text-foreground transition-opacity hover:bg-surface has-disabled:cursor-not-allowed has-disabled:opacity-50">
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
