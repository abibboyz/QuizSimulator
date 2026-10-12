import type { AnswerTextStyle, Question, QuizSettings, Theme } from "../types/quiz.ts";

const SINGLE_ANSWER_KINDS: readonly Question["kind"][] = ["multiple-choice", "multi-select", "image-choice", "reveal"];

/**
 * A question with exactly one answer (no new field): the answer is always
 * correct, a tap or a timeout always celebrates, and it is never scored.
 * True/false stays a fixed pair, so it never qualifies.
 */
export function isSingleAnswer(question: Pick<Question, "kind" | "options"> | undefined): boolean {
  return !!question && SINGLE_ANSWER_KINDS.includes(question.kind) && question.options.length === 1;
}

/** Image slides with no marked answer run without scoring or reveal feedback. A single answer wins over this path. */
export function isUnscoredImage(question: Pick<Question, "kind" | "options"> | undefined): boolean {
  return question?.kind === "image-choice" && !isSingleAnswer(question) && !question.options.some((option) => option.correct);
}

/** Counts toward score, streak, Correct x/y and accuracy. */
export function isScored(question: Pick<Question, "kind" | "options"> | undefined): boolean {
  return !isUnscoredImage(question) && !isSingleAnswer(question);
}

/** Whether the answer is shown with feedback right away: the quiz setting, or always for a single answer. */
export function showsFeedback(settings: Pick<QuizSettings, "revealAfterEach">, question: Pick<Question, "kind" | "options"> | undefined): boolean {
  return settings.revealAfterEach || isSingleAnswer(question);
}

export const ANSWER_BOX_SCALE_MIN = 0.05;
export const ANSWER_BOX_SCALE_MAX = 2.5;

/** Unset or 1 is today's answer card. Other values are clamped. */
export function answerBoxScale(style?: Pick<AnswerTextStyle, "boxScale">): number {
  const n = style?.boxScale;
  if (typeof n !== "number" || !Number.isFinite(n) || Math.abs(n - 1) < 0.001) return 1;
  return Math.min(ANSWER_BOX_SCALE_MAX, Math.max(ANSWER_BOX_SCALE_MIN, n));
}

/**
 * Stores a dragged or chosen answer-card size. 1 drops the field so an
 * untouched card matches a card that was resized and put back.
 */
export function withAnswerBoxScale(style: AnswerTextStyle | undefined, scale: number): AnswerTextStyle | undefined {
  const next = answerBoxScale({ boxScale: scale });
  if (next === 1) {
    if (!style || style.boxScale === undefined) return style;
    const { boxScale: _drop, ...rest } = style;
    return Object.keys(rest).length ? rest : undefined;
  }
  return { ...style, boxScale: Math.round(next * 100) / 100 };
}

/** Undefined fields inherit; false explicitly turns off an inherited style. */
export function answerTextStyle(theme: Pick<Theme, "answerStyle" | "optionTextColor">, question?: Pick<Question, "answerStyle">): AnswerTextStyle {
  const style: AnswerTextStyle = { color: theme.optionTextColor };
  for (const source of [theme.answerStyle, question?.answerStyle]) {
    for (const [key, value] of Object.entries(source ?? {})) {
      if (value !== undefined) Object.assign(style, { [key]: value });
    }
  }
  if (style.fontSize !== undefined) style.fontSize = Number.isFinite(style.fontSize) ? Math.min(150, Math.max(8, style.fontSize)) : undefined;
  return style;
}

export function unscoredResult(streak: number) {
  return { points: 0, basePoints: 0, speedPoints: 0, multiplier: 1, streakAfter: streak };
}
