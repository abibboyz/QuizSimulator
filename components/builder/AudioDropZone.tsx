"use client";

import { useRef, useState } from "react";
import type { MediaRef } from "@/types/quiz";
import { audioFromTransfer, MediaError, putAudio } from "@/lib/media";
import { playSample } from "@/lib/sound";

interface Props {
  media?: MediaRef;
  onChange: (media?: MediaRef) => void;
  label?: string;
}

/**
 * Drop or pick a sound file. The image version of this shows a thumbnail; a
 * sound has nothing to look at, so the affordance is a play button — hearing it
 * is the only way to confirm the right file landed.
 */
export function AudioDropZone({ media, onChange, label = "Sound" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange(await putAudio(file));
    } catch (e) {
      setError(e instanceof MediaError ? e.message : "Couldn't add that sound.");
    } finally {
      setBusy(false);
    }
  };

  const hidden = (
    <input
      ref={inputRef}
      type="file"
      accept="audio/*"
      className="hidden"
      onChange={(event) => {
        void accept(event.target.files?.[0] ?? null);
        event.target.value = "";
      }}
    />
  );

  if (media) {
    return (
      <div className="space-y-1">
        {hidden}
        <div className="flex items-center gap-2 rounded-xl border border-ink-700 bg-ink-900/50 px-3 py-2">
          <button
            type="button"
            onClick={() => void playSample(media)}
            aria-label="Play this sound"
            className="focus-ring grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-ink-600 text-sm transition hover:border-ink-500"
          >
            ▶
          </button>
          <span className="min-w-0 flex-1 truncate text-xs text-ink-300">Sound added</span>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs text-ink-400 hover:text-ink-200"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => onChange(undefined)}
            aria-label="Remove this sound"
            className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs text-ink-400 hover:text-bad"
          >
            ✕
          </button>
        </div>
        {error && <p className="text-xs text-bad">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {hidden}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void accept(audioFromTransfer(event.dataTransfer));
        }}
        className={`focus-ring flex w-full items-center justify-center rounded-xl border border-dashed px-4 py-4 text-center text-sm transition ${
          dragging ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink-600 text-ink-400 hover:border-ink-500"
        }`}
        aria-label={label}
      >
        {busy ? (
          "Processing…"
        ) : (
          <span>
            <span className="font-semibold text-ink-200">Drop a sound</span>
            <span className="text-ink-500"> · or click to browse</span>
          </span>
        )}
      </button>
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
