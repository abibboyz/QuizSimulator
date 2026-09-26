import { nanoid } from "nanoid";
import type { Option, Question, QuestionKind, Quiz, QuizSettings } from "@/types/quiz";
import { DEFAULT_IMAGE_GAP } from "@/lib/imageChoice";
import { SCHEMA_VERSION } from "@/types/quiz";
import { DEFAULT_THEME } from "@/lib/themes";
import { POST_PACK_CUES } from "@/lib/cues";
import { REVEAL_DEFAULTS } from "@/lib/reveal";

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
  // Sensible motion + sound out of the box; authors can clear or swap any slot.
  cues: { ...POST_PACK_CUES },
  progressStyle: "ring",
  progressPulse: "none",
  progressMascot: "\u{1F41B}",
  quizProgressStyle: "bar",
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

  if (kind === "image-choice") {
    return {
      id: newId(),
      kind,
      layout: "grid",
      prompt: "",
      optionGap: DEFAULT_IMAGE_GAP,
      // Two to start, so the grid opens on the large-tile case. Adding more
      // shrinks the pictures; a hundred is the small end of the same grid.
      options: [createOption("", true), createOption()],
    };
  }

  if (kind === "reveal") {
    return {
      id: newId(),
      kind,
      layout: "grid",
      prompt: "",
      options: [createOption("", true), createOption(), createOption(), createOption()],
      reveal: { ...REVEAL_DEFAULTS },
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
    // Copied rather than shared: editing the duplicate's cues must not reach
    // back into the question it came from.
    cues: question.cues ? { ...question.cues } : undefined,
    ...(question.reveal ? { reveal: { ...question.reveal } } : {}),
    ...(question.motion
      ? {
          motion: {
            ...(question.motion.question ? { question: { ...question.motion.question } } : {}),
            ...(question.motion.answers ? { answers: { ...question.motion.answers } } : {}),
          },
        }
      : {}),
  };
}

/** Text answers stay a short list. Image questions are the only kind that
 *  carries a large set, so leaving that kind has to shed the extras. */
const TEXT_OPTION_CAP = 6;

function capTextOptions(options: Option[]): Option[] {
  if (options.length <= TEXT_OPTION_CAP) return options;
  const sliced = options.slice(0, TEXT_OPTION_CAP);
  if (sliced.some((option) => option.correct) || !options.some((option) => option.correct)) return sliced;
  const correct = options.find((option) => option.correct)!;
  return [correct, ...sliced.slice(0, TEXT_OPTION_CAP - 1)];
}

/**
 * Switching question kind has to keep the options sane: true/false collapses to
 * a fixed pair, image-choice / multiple-choice collapse to a single correct,
 * and multi-select relaxes the single-correct rule.
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

  if (kind === "multiple-choice" || kind === "image-choice" || kind === "reveal") {
    // Collapse to exactly one correct answer — the first one marked, or the first option.
    const firstCorrect = base.findIndex((o) => o.correct);
    const keep = firstCorrect === -1 ? 0 : firstCorrect;
    const options = base.map((o, i) => ({ ...o, correct: i === keep }));
    return {
      ...question,
      kind,
      // Image answers always play as a responsive image grid; never big-text.
      layout: kind === "image-choice" || question.layout === "big-text" ? "grid" : question.layout,
      options: kind === "image-choice" ? options : capTextOptions(options),
      optionGap: kind === "image-choice" ? (question.optionGap ?? DEFAULT_IMAGE_GAP) : question.optionGap,
      // Reveal keeps any settings from an earlier round trip through the kind.
      ...(kind === "reveal" ? { reveal: question.reveal ?? { ...REVEAL_DEFAULTS } } : {}),
    };
  }

  return {
    ...question,
    kind,
    layout: question.layout === "big-text" ? "grid" : question.layout,
    options: capTextOptions(base),
  };
}
