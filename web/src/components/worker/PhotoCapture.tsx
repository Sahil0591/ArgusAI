"use client";

import { useRef, useState, type ChangeEvent } from "react";

export function PhotoCapture({
  material,
  onCapture,
}: {
  material: string;
  onCapture: (file: File) => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handleChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await onCapture(file);
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="rounded-lg border-2 border-dashed border-amber-300 bg-amber-50 p-4 text-center dark:border-amber-800 dark:bg-amber-950">
      <p className="mb-2 text-sm font-medium text-amber-900 dark:text-amber-100">
        Damage flagged on {material} &mdash; take a photo to continue
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        disabled={uploading}
        className="text-sm text-amber-900 dark:text-amber-100"
      />
      {uploading && <p className="mt-2 text-sm text-amber-700 dark:text-amber-300">Analyzing&hellip;</p>}
    </div>
  );
}
