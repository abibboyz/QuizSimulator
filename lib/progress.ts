/**
 * Timer meter styling. Pure so the builder's dropdowns, the meter itself, and
 * the test runner can all read from one place — imports stay type-only so this
 * runs under `node --test`, which strips types but can't resolve the `@/` alias.
 */

import type { ProgressPulse, ProgressStyle, QuizProgressStyle, QuizSettings } from "@/types/quiz";

export const COLORFUL_PROGRESS_GRADIENT = "linear-gradient(90deg, #22d3ee 0%, #8b5cf6 24%, #ec4899 48%, #f97316 72%, #facc15 100%)";

export const PROGRESS_STYLES: { id: ProgressStyle; label: string; hint: string }[] = [
  { id: "ring", label: "Ring", hint: "A circle that empties clockwise" },
  { id: "bar", label: "Bar", hint: "A straight track that drains" },
  { id: "colorful", label: "Colorful", hint: "A bright rainbow-gradient bar" },
  { id: "segments", label: "Segments", hint: "Blocks that go dark one by one" },
  { id: "pill", label: "Pill", hint: "Compact capsule with the count inside" },
  { id: "dots", label: "Dots", hint: "A row of lights going out" },
  { id: "mascot", label: "Mascot", hint: "A character racing the clock to the finish" },
];

/**
 * The single timer-style decision used by preview, web/mobile play, host and
 * video. When the configured shared mascot is visible on a timed question it
 * belongs to the countdown, so every surface renders the synchronized mascot
 * rail instead of a separate question-position rail.
 */
export function timerProgressStyle(settings: Pick<QuizSettings, "progressStyle" | "quizProgressStyle">): ProgressStyle {
  return settings.quizProgressStyle === "mascot" ? "mascot" : settings.progressStyle;
}

/**
 * Suggested characters for the mascot meter. Not a closed set — the setting
 * takes any character, the same way an answer tile's icon does, so an author
 * who wants something else is never stuck with this list.
 */
export const MASCOTS = ["🐛", "🐝", "🐞", "🦋", "🐜", "🦗", "🐌", "🕷️", "🦀", "🐢", "🦔", "🐿️"];

export const DEFAULT_MASCOT = "🐛";
export const DEFAULT_PROGRESS_THICKNESS = 4;

/** Keeps hand-edited/imported thickness values usable and visually bounded. */
export function progressThickness(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_PROGRESS_THICKNESS;
  return Math.min(20, Math.max(1, Math.round(value!)));
}

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

/** Timer mascot travel: full time is the start, zero time is the finish. */
export function timerMascotTravelFraction(fractionRemaining: number): number {
  const safe = Number.isFinite(fractionRemaining) ? Math.min(1, Math.max(0, fractionRemaining)) : 0;
  return 1 - safe;
}

/**
 * One geometry source for the countdown mascot and its fill endpoint.
 * `fillPx` is the character's centre, so the coloured rail can never lag
 * behind or run ahead after a question remount.
 */
export function timerMascotGeometry(fractionRemaining: number, trackPx: number, glyphPx: number) {
  const elapsed = timerMascotTravelFraction(fractionRemaining);
  const travelPx = elapsed * Math.max(0, trackPx - glyphPx);
  // During travel the fill meets the character's centre. At completion it
  // closes the final half-character gap so the whole finish line carries the
  // timer's final colour.
  const fillPx = elapsed >= 1 ? Math.max(0, trackPx) : travelPx + glyphPx / 2;
  return { elapsed, travelPx, fillPx };
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
  { id: "colorful", label: "Colorful", hint: "A rainbow-gradient track that fills as you go" },
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

/**
 * Position of a mascot racing from the first question to the last. Unlike a
 * filled completion bar, question 1 belongs at the starting line: for a
 * five-question quiz the positions are 0%, 25%, 50%, 75%, 100%.
 */
export function quizMascotFraction(reached: number, total: number): number {
  if (!Number.isFinite(reached) || !Number.isFinite(total) || total <= 0) return 0;
  if (total === 1) return 1;
  return Math.min(1, Math.max(0, (reached - 1) / (total - 1)));
}

/**
 * Number of questions the player has reached. `index` is zero-based, while a
 * progress meter counts the question currently on screen as reached.
 */
export function quizProgressReached(index: number, answered: number, total: number): number {
  if (!Number.isFinite(index) || !Number.isFinite(answered) || !Number.isFinite(total) || total <= 0) return 0;
  return Math.min(total, Math.max(0, Math.max(Math.floor(answered), Math.floor(index) + 1)));
}

/**
 * Whether the progress header shows: the quiz progress meter, the "Question N
 * of X" label and the question-type hint. Only an explicit `false` hides it, so
 * quizzes saved before the setting existed keep showing it.
 */
export function showsProgressBar(settings: { showProgressBar?: boolean } | undefined): boolean {
  return settings?.showProgressBar !== false;
}

/** Fills in `showProgressBar` on load: unset (older quizzes) becomes `true`. */
export function withProgressBarDefault<T extends { showProgressBar?: boolean }>(settings: T): T & { showProgressBar: boolean } {
  return { ...settings, showProgressBar: showsProgressBar(settings) };
}

/** Whether a per-question meter is still legible, or should degrade to a bar. */
export function showsPerQuestion(style: QuizProgressStyle, total: number): boolean {
  return (style === "segments" || style === "dots") && total > 0 && total <= MAX_PROGRESS_SEGMENTS;
}
