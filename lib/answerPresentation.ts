import type { AnswerTextStyle, Question, Theme } from "../types/quiz.ts";

/** Image slides with no marked answer run without scoring or reveal feedback. */
export function isUnscoredImage(question: Pick<Question, "kind" | "options"> | undefined): boolean {
  return question?.kind === "image-choice" && !question.options.some((option) => option.correct);
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
