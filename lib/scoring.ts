/** Pure scoring maths. No React, no storage — safe to unit test in isolation. */

export const STREAK_CAP = 5;
export const SPEED_BONUS_SHARE = 0.5;
export const STREAK_STEP = 0.1;

export interface ScoreInput {
  correct: boolean;
  /** Base points for this question. */
  base: number;
  /** 1 = answered instantly, 0 = answered as the timer expired. `null` if untimed. */
  timeLeftFraction: number | null;
  /** Consecutive correct answers *before* this one. */
  streakBefore: number;
  speedBonus: boolean;
  streakBonus: boolean;
}

export interface ScoreResult {
  points: number;
  basePoints: number;
  speedPoints: number;
  multiplier: number;
  streakAfter: number;
}

export function scoreQuestion(input: ScoreInput): ScoreResult {
  if (!input.correct) {
    return { points: 0, basePoints: 0, speedPoints: 0, multiplier: 1, streakAfter: 0 };
  }

  const fraction = input.timeLeftFraction === null ? null : clamp(input.timeLeftFraction, 0, 1);

  const speedPoints =
    input.speedBonus && fraction !== null ? Math.round(input.base * fraction * SPEED_BONUS_SHARE) : 0;

  const multiplier = input.streakBonus
    ? 1 + Math.min(input.streakBefore, STREAK_CAP) * STREAK_STEP
    : 1;

  return {
    points: Math.round((input.base + speedPoints) * multiplier),
    basePoints: input.base,
    speedPoints,
    multiplier,
    streakAfter: input.streakBefore + 1,
  };
}

/** The best score obtainable on a question, for "x out of y" displays. */
export function maxScore(base: number, speedBonus: boolean, streakBonus: boolean, timed: boolean): number {
  const speed = speedBonus && timed ? Math.round(base * SPEED_BONUS_SHARE) : 0;
  const multiplier = streakBonus ? 1 + STREAK_CAP * STREAK_STEP : 1;
  return Math.round((base + speed) * multiplier);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Fisher-Yates. Returns a new array; never mutates the source. */
export function shuffled<T>(items: readonly T[]): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function accuracyLabel(accuracy: number): { title: string; blurb: string; celebrate: boolean } {
  if (accuracy >= 1) return { title: "Flawless", blurb: "Every single one. Nothing left to prove.", celebrate: true };
  if (accuracy >= 0.8) return { title: "Sharp", blurb: "That is a seriously strong run.", celebrate: true };
  if (accuracy >= 0.6) return { title: "Solid", blurb: "More right than wrong — good showing.", celebrate: true };
  if (accuracy >= 0.4) return { title: "Warming up", blurb: "The shape of it is there. Go again.", celebrate: false };
  if (accuracy > 0) return { title: "Rough round", blurb: "Everyone starts somewhere. Retry the missed ones.", celebrate: false };
  return { title: "Ouch", blurb: "Nothing landed this time. The retry button is right there.", celebrate: false };
}
