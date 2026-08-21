/** Core data model. Everything the app stores or exports is described here. */

export const SCHEMA_VERSION = 1;

/**
 * Images are kept out of the quiz record itself. `stored` refs point at a Blob
 * in the IndexedDB `media` store; `url` refs point at the open web.
 */
export type MediaRef =
  | { kind: "stored"; id: string; w: number; h: number; alt?: string }
  | { kind: "url"; url: string; alt?: string };

export type QuestionKind = "multiple-choice" | "true-false" | "multi-select";

export type QuestionLayout = "grid" | "list" | "image-top" | "big-text";

export interface Option {
  id: string;
  text: string;
  media?: MediaRef;
  correct: boolean;
}

export interface Question {
  id: string;
  kind: QuestionKind;
  layout: QuestionLayout;
  prompt: string;
  media?: MediaRef;
  explanation?: string;
  options: Option[];
  /** Overrides the quiz-level timer. `null` means untimed. */
  timerSeconds?: number | null;
  /** Overrides the quiz-level base points. */
  points?: number;
}

export type ThemePreset = "neon" | "sunset" | "forest" | "candy" | "mono";

export type BgAnimation = "aurora" | "particles" | "shapes" | "starfield" | "none";

export type FontChoice = "sans" | "display" | "mono";

export type BgImageFit = "cover" | "contain" | "tile";

export interface Theme {
  preset: ThemePreset;
  bgAnimation: BgAnimation;
  accent: string;
  surface: string;
  font: FontChoice;
  /** Custom background picture. Animated GIFs keep animating. */
  bgImage?: MediaRef;
  bgImageFit: BgImageFit;
  /** 0–1 black overlay over the picture, so bright images don't eat the text. */
  bgImageDim: number;
}

export interface QuizSettings {
  /** `null` means untimed. */
  timerSeconds: number | null;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  /** Reveal the answer after each question vs. score silently until the end. */
  revealAfterEach: boolean;
  pointsBase: number;
  speedBonus: boolean;
  streakBonus: boolean;
  sound: boolean;
  /** Host mode: show the answer by itself when the timer runs out. */
  autoReveal: boolean;
  /** Host mode: seconds to wait after a reveal before moving on. `null` waits for the host. */
  autoAdvanceSeconds: number | null;
  /**
   * Solo play: when the timer expires with nothing picked, show the answer and
   * then carry on by itself. There's no decision left to make at that point, so
   * waiting on a click only stalls the run.
   */
  autoAdvanceOnTimeout: boolean;
  /** Seconds the answer stays up before solo play moves on after a timeout. */
  timeoutRevealSeconds: number;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  theme: Theme;
  settings: QuizSettings;
  questions: Question[];
  createdAt: number;
  updatedAt: number;
  schemaVersion: number;
}

/** What the dashboard needs, without dragging every question into memory. */
export interface QuizSummary {
  id: string;
  title: string;
  description?: string;
  questionCount: number;
  theme: Theme;
  updatedAt: number;
}

export function toSummary(quiz: Quiz): QuizSummary {
  return {
    id: quiz.id,
    title: quiz.title,
    description: quiz.description,
    questionCount: quiz.questions.length,
    theme: quiz.theme,
    updatedAt: quiz.updatedAt,
  };
}

/** Problems worth blocking or warning about before a quiz goes live. */
export interface ValidationIssue {
  questionId: string | null;
  severity: "error" | "warning";
  message: string;
}

export function validateQuiz(quiz: Quiz): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (!quiz.questions.length) {
    issues.push({ questionId: null, severity: "error", message: "This quiz has no questions yet." });
  }

  quiz.questions.forEach((q, i) => {
    const label = `Question ${i + 1}`;
    if (!q.prompt.trim() && !q.media) {
      issues.push({ questionId: q.id, severity: "error", message: `${label} has no prompt or image.` });
    }
    if (q.options.length < 2) {
      issues.push({ questionId: q.id, severity: "error", message: `${label} needs at least 2 answers.` });
    }
    if (!q.options.some((o) => o.correct)) {
      issues.push({ questionId: q.id, severity: "error", message: `${label} has no correct answer marked.` });
    }
    if (q.options.some((o) => !o.text.trim() && !o.media)) {
      issues.push({ questionId: q.id, severity: "warning", message: `${label} has a blank answer option.` });
    }
  });

  return issues;
}
