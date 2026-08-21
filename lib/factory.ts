import { nanoid } from "nanoid";
import type { Option, Question, QuestionKind, Quiz, QuizSettings } from "@/types/quiz";
import { SCHEMA_VERSION } from "@/types/quiz";
import { DEFAULT_THEME } from "@/lib/themes";

export function newId(): string {
  return nanoid(12);
}

export const DEFAULT_SETTINGS: QuizSettings = {
  timerSeconds: 20,
  shuffleQuestions: false,
  shuffleOptions: false,
  revealAfterEach: true,
  pointsBase: 1000,
  speedBonus: true,
  streakBonus: true,
  sound: true,
  autoReveal: false,
  autoAdvanceSeconds: null,
  autoAdvanceOnTimeout: true,
  timeoutRevealSeconds: 5,
};

export function createOption(text = "", correct = false): Option {
  return { id: newId(), text, correct };
}

export function createQuestion(kind: QuestionKind = "multiple-choice"): Question {
  if (kind === "true-false") {
    return {
      id: newId(),
      kind,
      layout: "big-text",
      prompt: "",
      options: [
        { id: newId(), text: "True", correct: true },
        { id: newId(), text: "False", correct: false },
      ],
    };
  }

  return {
    id: newId(),
    kind,
    layout: "grid",
    prompt: "",
    options: [createOption("", true), createOption(), createOption(), createOption()],
  };
}

export function createQuiz(title = "Untitled quiz"): Quiz {
  const now = Date.now();
  return {
    id: newId(),
    title,
    description: "",
    theme: { ...DEFAULT_THEME },
    settings: { ...DEFAULT_SETTINGS },
    questions: [createQuestion()],
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
  };
}

/** Deep-copies a question with fresh ids so it can sit alongside the original. */
export function duplicateQuestion(question: Question): Question {
  return {
    ...question,
    id: newId(),
    options: question.options.map((o) => ({ ...o, id: newId() })),
  };
}

/**
 * Switching question kind has to keep the options sane: true/false collapses to
 * a fixed pair, and multi-select relaxes the single-correct rule.
 */
export function convertKind(question: Question, kind: QuestionKind): Question {
  if (kind === question.kind) return question;

  if (kind === "true-false") {
    return {
      ...question,
      kind,
      layout: "big-text",
      options: [
        { id: newId(), text: "True", correct: true },
        { id: newId(), text: "False", correct: false },
      ],
    };
  }

  const base =
    question.kind === "true-false"
      ? [createOption("", true), createOption(), createOption(), createOption()]
      : question.options;

  if (kind === "multiple-choice") {
    // Collapse to exactly one correct answer — the first one marked, or the first option.
    const firstCorrect = base.findIndex((o) => o.correct);
    const keep = firstCorrect === -1 ? 0 : firstCorrect;
    return {
      ...question,
      kind,
      layout: question.layout === "big-text" ? "grid" : question.layout,
      options: base.map((o, i) => ({ ...o, correct: i === keep })),
    };
  }

  return { ...question, kind, layout: question.layout === "big-text" ? "grid" : question.layout, options: base };
}
