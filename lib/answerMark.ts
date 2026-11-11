import type { AnswerMarkStyle, Question, QuizSettings } from "@/types/quiz";

/**
 * How the correct answer is shown when it is revealed.
 *
 * `classic` is how every quiz looked before this setting existed: the other
 * answers fade to 35% and lose half their colour, and the correct one gets the
 * theme's ring and a small tick. It stays the fallback, so a quiz saved
 * without `answerMark` plays, hosts and exports exactly as it always did.
 *
 * `circle` keeps every answer at full colour. The correct answer pops a little
 * in place and a hand-drawn-style circle is drawn round it — the "find the odd
 * one out" look. Play, host, builder preview and video export all read the
 * same numbers from here, so the four never drift apart.
 */
export const ANSWER_MARK = {
  /** Default circle colour: a bright red that reads on light and dark themes. */
  color: "#ef4444",
  /** One by one: the next right answer starts this long after the one before. */
  stepMs: 520,
  /** The circle draws itself over this long. */
  drawMs: 450,
  /** The pop: up to `peak`, then settles at `rest` and stays there. */
  popMs: 420,
  peak: 1.16,
  rest: 1.06,
  /** The circle sits this much outside the tile on each axis (1 = touching). */
  reach: 1.12,
  /** Stroke width as a share of the tile's shorter side, clamped in pixels. */
  strokeShare: 0.07,
  minStroke: 3,
  maxStroke: 12,
} as const;

export const ANSWER_MARK_STYLES: readonly AnswerMarkStyle[] = ["classic", "circle"];

export interface ResolvedAnswerMark {
  style: AnswerMarkStyle;
  color: string;
}

/** Question override first, then the quiz setting, then `classic` (today's look). */
export function resolveAnswerMark(
  settings: Pick<QuizSettings, "answerMark"> | undefined,
  question?: Pick<Question, "answerMark">,
): ResolvedAnswerMark {
  const style = question?.answerMark?.style ?? settings?.answerMark?.style ?? "classic";
  const color = question?.answerMark?.color || settings?.answerMark?.color || ANSWER_MARK.color;
  return { style: ANSWER_MARK_STYLES.includes(style) ? style : "classic", color };
}

/**
 * How long after the reveal this answer's circle starts. One by one (the default)
 * goes through the right answers in their on-screen order; `together` starts them all at once.
 */
export function circleDelayMs(question: Pick<Question, "options" | "circleOrder">, optionId: string): number {
  if (question.circleOrder === "together") return 0;
  const turn = question.options.filter((option) => option.correct).findIndex((option) => option.id === optionId);
  return Math.max(0, turn) * ANSWER_MARK.stepMs;
}

/** Only the classic look fades the answers that weren't right. */
export function fadesOtherAnswers(mark: Pick<ResolvedAnswerMark, "style">): boolean {
  return mark.style === "classic";
}

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);
const clamp01 = (p: number) => Math.min(1, Math.max(0, p));

/**
 * The correct answer's pose `ms` after the reveal: its scale (the pop) and how
 * much of the circle is drawn, 0–1. Before the reveal it is at rest with no circle.
 */
export function answerMarkAt(ms: number, reduced = false): { scale: number; circle: number } {
  if (!(ms >= 0)) return { scale: 1, circle: 0 };
  if (reduced) return { scale: ANSWER_MARK.rest, circle: 1 };
  const circle = easeOut(clamp01(ms / ANSWER_MARK.drawMs));
  const p = clamp01(ms / ANSWER_MARK.popMs);
  // Rise to the peak over the first 40%, then ease down to the resting size.
  const scale = p < 0.4
    ? 1 + (ANSWER_MARK.peak - 1) * easeOut(p / 0.4)
    : ANSWER_MARK.peak + (ANSWER_MARK.rest - ANSWER_MARK.peak) * easeOut((p - 0.4) / 0.6);
  return { scale, circle };
}

/** Ellipse round a `w`×`h` tile, centred on it: radii and stroke width in the same units. */
export function answerMarkEllipse(w: number, h: number): { rx: number; ry: number; stroke: number } {
  const stroke = Math.min(ANSWER_MARK.maxStroke, Math.max(ANSWER_MARK.minStroke, Math.min(w, h) * ANSWER_MARK.strokeShare));
  return { rx: (w / 2) * ANSWER_MARK.reach + stroke / 2, ry: (h / 2) * ANSWER_MARK.reach + stroke / 2, stroke };
}

/**
 * The circle starts at the top-left and runs clockwise a little past a full turn,
 * so the ends overlap like a marker pen. `circle` is the share drawn so far.
 */
export const ANSWER_MARK_START = -Math.PI * 0.75;
export const ANSWER_MARK_SWEEP = Math.PI * 2.12;
