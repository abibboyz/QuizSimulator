/**
 * Timer meter styling. Pure so the builder's dropdowns, the meter itself, and
 * the test runner can all read from one place — imports stay type-only so this
 * runs under `node --test`, which strips types but can't resolve the `@/` alias.
 */

import type { ProgressPulse, ProgressStyle, QuizProgressStyle } from "@/types/quiz";

export const PROGRESS_STYLES: { id: ProgressStyle; label: string; hint: string }[] = [
  { id: "ring", label: "Ring", hint: "A circle that empties clockwise" },
  { id: "bar", label: "Bar", hint: "A straight track that drains" },
  { id: "segments", label: "Segments", hint: "Blocks that go dark one by one" },
  { id: "pill", label: "Pill", hint: "Compact capsule with the count inside" },
  { id: "dots", label: "Dots", hint: "A row of lights going out" },
  { id: "mascot", label: "Mascot", hint: "A character racing the clock to the finish" },
];

/**
 * Suggested characters for the mascot meter. Not a closed set — the setting
 * takes any character, the same way an answer tile's icon does, so an author
 * who wants something else is never stuck with this list.
 */
export const MASCOTS = ["🐛", "🐝", "🐞", "🦋", "🐜", "🦗", "🐌", "🕷️", "🦀", "🐢", "🦔", "🐿️"];

export const DEFAULT_MASCOT = "🐛";

/** Blank or whitespace-only settings fall back rather than rendering nothing. */
export function mascotOf(value: string | undefined): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_MASCOT;
}

export const PROGRESS_PULSES: { id: ProgressPulse; label: string; hint: string }[] = [
  { id: "none", label: "None", hint: "Still, apart from draining" },
  { id: "heartbeat", label: "Heartbeat", hint: "A double thump that races as time runs out" },
  { id: "throb", label: "Throb", hint: "A steady swell" },
  { id: "flash", label: "Flash", hint: "Blinks, faster the less time is left" },
];

/** How many lights a segmented or dotted meter draws. */
export const METER_STEPS = 8;

/**
 * Lit steps for the discrete meters. Rounded up so the last step only goes out
 * at zero — a meter that reads empty while the player still has a second left
 * makes the app look broken.
 */
export function litSteps(fraction: number, steps = METER_STEPS): number {
  const safe = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  if (safe <= 0) return 0;
  return Math.max(1, Math.ceil(safe * steps));
}

/**
 * Pulse period in milliseconds. Fast when little time is left, which is what
 * turns a decoration into a warning — the meter reads as urgent before the
 * player has read the number.
 */
export function pulseMs(fraction: number): number {
  const safe = Number.isFinite(fraction) ? Math.min(1, Math.max(0, fraction)) : 0;
  return Math.round(420 + safe * 900);
}

export const PULSE_CLASS: Record<ProgressPulse, string> = {
  none: "",
  heartbeat: "animate-meter-heartbeat",
  throb: "animate-meter-throb",
  flash: "animate-meter-flash",
};

/* ------------------------------------------------------- quiz-wide progress */

export const QUIZ_PROGRESS_STYLES: { id: QuizProgressStyle; label: string; hint: string }[] = [
  { id: "bar", label: "Bar", hint: "A track that fills as you go" },
  { id: "segments", label: "Segments", hint: "One block per question, coloured by how it went" },
  { id: "dots", label: "Dots", hint: "One dot per question, coloured by how it went" },
  { id: "mascot", label: "Mascot", hint: "A character walking the length of the quiz" },
  { id: "none", label: "Hidden", hint: "No quiz progress meter" },
];

/**
 * Past this many questions the per-question meters stop being readable — the
 * blocks are thinner than the gaps between them — so they fall back to a bar.
 */
export const MAX_PROGRESS_SEGMENTS = 20;

export function quizProgressFraction(answered: number, total: number): number {
  if (!Number.isFinite(answered) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(1, Math.max(0, answered / total));
}

/** Whether a per-question meter is still legible, or should degrade to a bar. */
export function showsPerQuestion(style: QuizProgressStyle, total: number): boolean {
  return (style === "segments" || style === "dots") && total > 0 && total <= MAX_PROGRESS_SEGMENTS;
}
