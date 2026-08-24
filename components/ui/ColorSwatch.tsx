"use client";

import { contrastRatio } from "@/lib/themes";

/** Below this, text stops being comfortably readable (WCAG AA for body text). */
const MIN_CONTRAST = 4.5;

interface Props {
  /** The chosen colour, or undefined when the theme default is still in force. */
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  /** What the element actually renders as while `value` is unset. */
  fallback: string;
  /** Names the control for screen readers, e.g. "Question text colour". */
  label: string;
  /**
   * Backgrounds this colour will sit on. If it fails contrast against any of
   * them the swatch flags it — the case that matters is answer-tile text, which
   * has to work on six different tile colours at once.
   */
  contrastAgainst?: string[];
  /** Drops the reset button to a hover affordance, for tight rows. */
  compact?: boolean;
}

/**
 * Compact colour control designed to sit beside a field label rather than in a
 * settings panel, so the colour is set where the thing being coloured is edited.
 *
 * Unset is a real state, not the same as "happens to equal the default": it
 * means the element follows the theme, so switching age band re-colours it.
 */
export function ColorSwatch({ value, onChange, fallback, label, contrastAgainst, compact }: Props) {
  const effective = value ?? fallback;

  const failing = (contrastAgainst ?? []).filter((bg) => {
    const ratio = contrastRatio(effective, bg);
    return ratio !== null && ratio < MIN_CONTRAST;
  });

  const warning =
    failing.length > 0
      ? `Hard to read on ${failing.length} of ${contrastAgainst!.length} answer tiles. Leave it unset to let each tile pick black or white automatically.`
      : null;

  return (
    <span className="flex items-center gap-1">
      {warning && (
        <span
          title={warning}
          aria-label={warning}
          role="img"
          className="cursor-help text-xs leading-none text-amber-400"
        >
          ⚠
        </span>
      )}

      {value !== undefined && (
        <button
          type="button"
          onClick={() => onChange(undefined)}
          title="Reset to the theme default"
          aria-label={`Reset ${label} to the theme default`}
          className={`focus-ring rounded text-xs leading-none text-ink-500 transition hover:text-ink-200 ${
            compact ? "px-0.5" : "px-1"
          }`}
        >
          ↺
        </button>
      )}

      <input
        type="color"
        value={effective}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
        title={value === undefined ? `${label} — following the theme` : `${label} — ${value}`}
        className={`focus-ring cursor-pointer rounded border bg-transparent p-0 ${
          compact ? "h-6 w-5" : "h-5 w-7"
        } ${value === undefined ? "border-ink-600 opacity-60" : "border-ink-400"}`}
      />
    </span>
  );
}
