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
