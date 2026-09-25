/**
 * Timing and motion constants for a solo run, shared between the live play
 * screen and the video exporter (`lib/videoExport`). They used to be literals
 * inside the components; pulling them here is what keeps an exported video
 * from drifting away from what the app actually does when a run plays itself.
 *
 * Pure data and maths only — no React, no DOM — so it stays importable from
 * anywhere, including `node --test`.
 */

export type CubicBezier = [number, number, number, number];

/**
 * The question swap in solo play. `AnimatePresence mode="wait"` runs the exit
 * to completion before the next question mounts, so a swap takes two of these
 * back to back: the old question slides out, then the new one slides in.
 */
export const QUESTION_SWAP = {
  durationS: 0.2,
  ease: [0.2, 0.8, 0.3, 1] as CubicBezier,
  /** Horizontal travel in CSS px: enters from +x, exits to −x. */
  offsetPx: 36,
};

/** With instant reveal switched off, how long a scored question pauses before moving on. */
export const REVEAL_OFF_HOLD_MS = 220;

/** `.animate-tile-in` (globals.css): answer tiles land one after another. */
export const TILE_IN = {
  durationMs: 300,
  staggerMs: 45,
  /** Capped so a six-answer question doesn't make the last one feel late. */
  maxStaggerSteps: 4,
  ease: [0.2, 0.8, 0.3, 1] as CubicBezier,
};

export function tileDelayMs(index: number): number {
  return Math.min(index, TILE_IN.maxStaggerSteps) * TILE_IN.staggerMs;
}

/** `.animate-pop` (globals.css): the explanation card on reveal, the results header. */
export const POP_IN = { durationMs: 280, ease: [0.2, 0.8, 0.3, 1] as CubicBezier };

/** `transition-all duration-200` on answer tiles: the reveal colour change. */
export const TILE_STATE_MS = 200;

/** `useAnimatedNumber` default: the score climbing after a correct answer. */
export const SCORE_TWEEN_MS = 650;

/** The start cue's counter. The last beat is the "go" signal. */
export const COUNTDOWN_BEATS = ["3", "2", "1", "Go!"];

/** Each beat pops in (and the previous one out) over this long. */
export function countdownBeatTransitionS(perBeatMs: number): number {
  return Math.min(0.35, perBeatMs / 1000);
}

/**
 * The stars cue's lanes, in % of the screen width. Fixed rather than random: a
 * server/client mismatch would warn on hydration, and a repeatable shower is
 * easier to tune than a random one.
 */
export const STAR_LANES = [6, 18, 29, 41, 52, 63, 74, 86, 94, 12, 36, 58, 81];

export interface ConfettiBurst {
  x: number;
  y: number;
  angle: number;
}

export interface ConfettiPreset {
  particleCount: number;
  spread: number;
  startVelocity: number;
  ticks: number;
  bursts: ConfettiBurst[];
}

/** The "confetti" cue: two bursts from the lower corners. */
export const CUE_CONFETTI: ConfettiPreset = {
  particleCount: 60,
  spread: 65,
  startVelocity: 42,
  ticks: 160,
  bursts: [
    { x: 0.15, y: 0.85, angle: 60 },
    { x: 0.85, y: 0.85, angle: 120 },
  ],
};

/** The stock results celebration, used when no outro cue is set. */
export const RESULTS_CONFETTI: ConfettiPreset = {
  particleCount: 70,
  spread: 70,
  startVelocity: 45,
  ticks: 180,
  bursts: [
    { x: 0.1, y: 0.9, angle: 60 },
    { x: 0.9, y: 0.9, angle: 120 },
  ],
};

/**
 * Which tick the question timer sounds when the whole seconds left change:
 * urgent in the last quarter, a plain tick from ten seconds down, nothing
 * before that.
 */
export function timerTickKind(elapsedMs: number, limitMs: number, secondsLeft: number): "urgent" | "tick" | null {
  if (elapsedMs / limitMs > 0.75) return "urgent";
  if (secondsLeft <= 10) return "tick";
  return null;
}
