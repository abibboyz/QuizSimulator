"use client";

import { useState } from "react";
import type { Cue, CueAnimation, CueSound } from "@/types/quiz";
import { ANIMATION_IDS, ANIMATIONS, needsMedia } from "@/lib/animations";
import { DEFAULT_CUE_MS } from "@/lib/cues";
import { SOUND_IDS, SOUNDS, playCue } from "@/lib/sound";
import { Input, Select } from "@/components/ui/Field";
import { MediaDropZone } from "@/components/builder/MediaDropZone";
import { AudioDropZone } from "@/components/builder/AudioDropZone";
import { CuePlayer } from "@/components/play/CuePlayer";

interface Props {
  label: string;
  hint: string;
  cue: Cue | null | undefined;
  /** `null` clears the slot; `undefined` means "inherit", when inheriting is on. */
  onChange: (cue: Cue | null | undefined) => void;
  /**
   * Turns the row tri-state for question-level editing. The string describes
   * what would be inherited, e.g. "Confetti burst + Fanfare". Quiz-level rows
   * leave this off — there is nothing above them to inherit from.
   */
  inherits?: string;
}

const EMPTY: Cue = { animation: null, sound: null, durationMs: DEFAULT_CUE_MS };

type Mode = "inherit" | "silent" | "custom";

/** One-line summary of what a cue does, for the inherit button's label. */
export function describeCue(cue: Cue | null | undefined): string {
  if (!cue) return "Nothing";
  const parts = [
    cue.animation ? ANIMATIONS[cue.animation].label : null,
    cue.sound ? SOUNDS[cue.sound].label : null,
  ].filter(Boolean);
  return parts.length ? parts.join(" + ") : "Nothing";
}

/**
 * One row of the motion-and-sound list: pick an animation, pick a sound, hear
 * it. Both halves are optional, and a row with neither set clears the slot —
 * which is also how a quiz stays silent by default.
 *
 * With `inherits`, the row gains a third state. That distinction only exists at
 * question level: "say nothing" (fall through to the quiz) and "stay silent"
 * (override the quiz back to off) are the same thing for a quiz-wide row and
 * genuinely different for a question.
 */
export function CueEditor({ label, hint, cue, onChange, inherits }: Props) {
  // Auditioning the real component, not an approximation — an author should see
  // exactly what a player will, including the hold time they typed.
  const [preview, setPreview] = useState(0);
  const current = cue ?? EMPTY;

  const mode: Mode = !inherits ? "custom" : cue === undefined ? "inherit" : cue === null ? "silent" : "custom";

  const set = (patch: Partial<Cue>) => {
    const next = { ...current, ...patch };
    // A question-level row holds its object even when emptied, so clearing both
    // dropdowns doesn't make the row snap back to "Silent" mid-edit. It plays
    // nothing either way — `cueEnabled` treats an empty cue as inert.
    if (inherits) onChange(next);
    else onChange(next.animation || next.sound ? next : null);
  };

  const pickAnimation = (value: string) => {
    const animation = (value || null) as CueAnimation | null;
    // Seed the hold time from the animation's own pacing — a countdown needs
    // seconds, a shake is over in a blink.
    set({ animation, durationMs: animation ? ANIMATIONS[animation].defaultMs : current.durationMs });
  };

  const active = mode === "custom" && !!(current.animation || current.sound);

  return (
    <div
      className={`space-y-2 rounded-xl border p-3 transition ${
        active ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-ink-700"
      }`}
    >
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink-100">{label}</p>
          <p className="text-xs text-ink-500">{hint}</p>
        </div>
        {active && (
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setPreview((n) => n + 1)}
              className="focus-ring rounded-lg px-2 py-1 text-xs text-ink-300 hover:text-ink-100"
            >
              Preview
            </button>
            {!inherits && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="focus-ring rounded-lg px-2 py-1 text-xs text-ink-400 hover:text-ink-200"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Keyed so pressing Preview again restarts a cue that is still running. */}
      {preview > 0 && (
        <CuePlayer key={preview} cue={current} onDone={() => setPreview(0)} soundOn />
      )}

      {inherits && (
        <div className="flex gap-1 rounded-xl border border-ink-700 bg-ink-900/50 p-1">
          {(
            [
              ["inherit", `Quiz default · ${inherits}`],
              ["silent", "Silent"],
              ["custom", "Custom"],
            ] as [Mode, string][]
          ).map(([id, text]) => (
            <button
              key={id}
              type="button"
              onClick={() => onChange(id === "inherit" ? undefined : id === "silent" ? null : (cue ?? EMPTY))}
              aria-pressed={mode === id}
              className={`focus-ring min-w-0 flex-1 truncate rounded-lg px-2 py-1.5 text-xs transition ${
                mode === id
                  ? "bg-[var(--accent-soft)] font-semibold text-ink-100 ring-1 ring-[var(--accent-line)]"
                  : "text-ink-400 hover:text-ink-200"
              }`}
              title={text}
            >
              {text}
            </button>
          ))}
        </div>
      )}

      {mode === "custom" && (
      <div className="grid grid-cols-2 gap-2">
        <Select
          value={current.animation ?? ""}
          onChange={(event) => pickAnimation(event.target.value)}
          aria-label={`${label} animation`}
        >
          <option value="">No animation</option>
          {ANIMATION_IDS.map((id) => (
            <option key={id} value={id}>
              {ANIMATIONS[id].label}
            </option>
          ))}
        </Select>

        <div className="flex gap-2">
          <Select
            value={current.sound ?? ""}
            onChange={(event) => set({ sound: (event.target.value || null) as CueSound | null })}
            aria-label={`${label} sound`}
          >
            <option value="">No sound</option>
            {SOUND_IDS.map((id) => (
              <option key={id} value={id}>
                {SOUNDS[id].label}
              </option>
            ))}
          </Select>
          <button
            type="button"
            disabled={!current.sound || (current.sound === "custom" && !current.soundMedia)}
            onClick={() => playCue(current.sound, current.soundMedia)}
            aria-label={`Preview the ${label} sound`}
            className="focus-ring shrink-0 rounded-xl border border-ink-600 px-3 text-sm text-ink-200 transition hover:border-ink-500 disabled:opacity-40"
          >
            ▶
          </button>
        </div>
      </div>
      )}

      {active && (
        <label className="flex items-center gap-2 text-xs text-ink-400">
          <span className="shrink-0">Hold for</span>
          <Input
            type="number"
            min={200}
            max={15000}
            step={100}
            value={current.durationMs}
            onChange={(event) => set({ durationMs: Number(event.target.value) || DEFAULT_CUE_MS })}
            className="w-28"
            aria-label={`${label} duration in milliseconds`}
          />
          <span className="shrink-0">ms</span>
        </label>
      )}

      {current.sound === "custom" && (
        <div className="space-y-1">
          <AudioDropZone
            media={current.soundMedia}
            onChange={(soundMedia) => set({ soundMedia })}
            label="Cue sound"
          />
          {!current.soundMedia && (
            <p className="text-xs text-ink-500">Pick a sound file — without one this cue stays silent.</p>
          )}
        </div>
      )}

      {needsMedia(current.animation) && (
        <div className="space-y-1">
          <MediaDropZone media={current.media} onChange={(media) => set({ media })} label="Cue image" />
          {!current.media && (
            <p className="text-xs text-ink-500">Pick a picture or GIF — without one this cue shows nothing.</p>
          )}
        </div>
      )}
    </div>
  );
}
