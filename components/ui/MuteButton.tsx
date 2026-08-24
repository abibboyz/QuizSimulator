"use client";

import { setMuted } from "@/lib/sound";
import { useMuted } from "@/hooks/useMuted";

/**
 * Silences this device for good, independent of the quiz's own `sound` setting.
 * That setting belongs to the author; this one belongs to whoever is sitting in
 * front of the screen — in a library, in a shared room, at 6am.
 */
export function MuteButton({ className = "" }: { className?: string }) {
  const muted = useMuted();

  return (
    <button
      type="button"
      onClick={() => setMuted(!muted)}
      aria-pressed={muted}
      aria-label={muted ? "Unmute sound" : "Mute sound"}
      title={muted ? "Unmute" : "Mute"}
      className={`focus-ring grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ink-700 bg-ink-900/60 text-base transition hover:border-ink-500 ${
        muted ? "text-ink-500" : "text-ink-200"
      } ${className}`}
    >
      <span aria-hidden>{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}
