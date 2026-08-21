"use client";

import { useRef, useState } from "react";
import type { MediaRef } from "@/types/quiz";
import { imageFromTransfer, MediaError, putImage } from "@/lib/media";
import { MediaImage } from "@/components/ui/MediaImage";
import { Input } from "@/components/ui/Field";

interface Props {
  media?: MediaRef;
  onChange: (media?: MediaRef) => void;
  /** Small variant used inside answer rows. */
  compact?: boolean;
  label?: string;
}

/**
 * Drop, pick, or paste an image. Pasting is handled by the question editor at
 * the window level; this component covers drag-and-drop and the file picker.
 */
export function MediaDropZone({ media, onChange, compact = false, label = "Image" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async (file: File | null) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    try {
      onChange(await putImage(file));
    } catch (e) {
      setError(e instanceof MediaError ? e.message : "Couldn't add that image.");
    } finally {
      setBusy(false);
    }
  };

  const hidden = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={(event) => {
        void accept(event.target.files?.[0] ?? null);
        event.target.value = "";
      }}
    />
  );

  if (media) {
    return (
      <div className={compact ? "" : "space-y-2"}>
        {hidden}
        <div className={`group relative overflow-hidden rounded-xl border border-ink-700 ${compact ? "h-10 w-10" : ""}`}>
          <MediaImage
            media={media}
            className={compact ? "h-10 w-10 object-cover" : "max-h-48 w-full bg-ink-950 object-contain"}
          />
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-ink-950/80 opacity-0 transition group-hover:opacity-100">
            {!compact && (
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                className="focus-ring rounded-lg bg-ink-800 px-2 py-1 text-xs font-semibold"
              >
                Replace
              </button>
            )}
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="focus-ring rounded-lg bg-bad/80 px-2 py-1 text-xs font-semibold text-white"
              aria-label="Remove image"
            >
              {compact ? "✕" : "Remove"}
            </button>
          </div>
        </div>

        {!compact && (
          <Input
            value={media.alt ?? ""}
            onChange={(event) => onChange({ ...media, alt: event.target.value })}
            placeholder="Alt text (describe the image)"
          />
        )}
        {error && <p className="text-xs text-bad">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      {hidden}
      <button
        type="button"
        data-media-zone
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void accept(imageFromTransfer(event.dataTransfer));
        }}
        className={`focus-ring flex w-full items-center justify-center rounded-xl border border-dashed text-center transition ${
          compact ? "h-10 w-10 text-lg" : "px-4 py-6 text-sm"
        } ${dragging ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink-600 text-ink-400 hover:border-ink-500"}`}
        aria-label={compact ? "Add an image to this answer" : label}
      >
        {busy ? (
          compact ? "…" : "Processing…"
        ) : compact ? (
          "🖼"
        ) : (
          <span>
            <span className="font-semibold text-ink-200">Drop an image</span>
            <span className="text-ink-500"> · click to browse · or paste one</span>
          </span>
        )}
      </button>
      {error && <p className="mt-1 text-xs text-bad">{error}</p>}
    </div>
  );
}
