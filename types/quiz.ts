/** Core data model. Everything the app stores or exports is described here. */

export const SCHEMA_VERSION = 1;

/**
 * Images are kept out of the quiz record itself. `stored` refs point at a Blob
 * in the IndexedDB `media` store; `url` refs point at the open web.
 */
export type MediaRef =
  | { kind: "stored"; id: string; w: number; h: number; alt?: string }
  | { kind: "url"; url: string; alt?: string };

/* ------------------------------------------------------------------- cues */

/**
 * A cue is one animation plus one sound, fired at a named moment in a run.
 * Both halves are optional, so a cue can be pure sound, pure motion, or — the
 * default everywhere — nothing at all.
 */
export type CueAnimation =
  | "countdown"
  | "confetti"
  | "stars"
  | "pulse-ring"
  | "shake"
  | "stamp"
  /** Whatever the author uploaded, held on screen for the cue's duration. */
  | "image";

export type CueSound =
  | "start"
  | "correct"
  | "wrong"
  | "whoosh"
  | "riser"
  | "buzz"
  | "fanfare"
  | "consolation"
  /** Whatever the author uploaded, mirroring the "image" animation. */
  | "custom";

export interface Cue {
  animation: CueAnimation | null;
  /** Only read when `animation` is "image". */
  media?: MediaRef;
  sound: CueSound | null;
  /** Only read when `sound` is "custom". */
  soundMedia?: MediaRef;
  /** How long the overlay holds before the run carries on. */
  durationMs: number;
}

/**
 * `intro` plays before the first question, `between` after a question is done
 * and before the next one lands, `outro` on the results screen.
 */
export type CueSlot = "intro" | "correct" | "wrong" | "between" | "outro";

/**
 * A missing slot falls through to the quiz-wide default; an explicit `null`
 * overrides that default back to silence. That distinction is the only way one
 * question can opt out of a celebration the rest of the quiz uses.
 */
export type CueSet = Partial<Record<CueSlot, Cue | null>>;

/** How the question timer draws itself. */
export type ProgressStyle = "ring" | "bar" | "segments" | "pill" | "dots" | "mascot";

/** Motion layered on the timer as it drains — quickens as time runs out. */
export type ProgressPulse = "none" | "heartbeat" | "throb" | "flash";

/**
 * How far through the quiz you are — counts up, unlike the timer. Separate
 * from the timer's own style: a quiz can want a ring counting down and a bar
 * filling up at the same time.
 */
export type QuizProgressStyle = "none" | "bar" | "segments" | "dots" | "mascot";

export type QuestionKind = "multiple-choice" | "true-false" | "multi-select" | "image-choice";

export type QuestionLayout = "grid" | "list" | "image-top" | "big-text";

export interface Option {
  id: string;
  text: string;
  media?: MediaRef;
  correct: boolean;
  /**
   * Replaces this one answer's marker — any character or emoji. Blank falls
   * back to whatever `Theme.optionMarker` produces for its position.
   */
  icon?: string;
  /**
   * Replaces this one answer's tile colour. Blank falls back to the quiz-wide
   * `Theme.optionColors`, and then to the palette for its position.
   */
  color?: string;
}

/** What to draw in the little badge on each answer tile. */
export type OptionMarker = "shapes" | "letters" | "numbers" | "bullets" | "none";

export interface Question {
  id: string;
  kind: QuestionKind;
  layout: QuestionLayout;
  prompt: string;
  media?: MediaRef;
  explanation?: string;
  options: Option[];
  /**
   * Gap in pixels between answer tiles. Used by `image-choice` (and ignored by
   * other kinds). Unset means 12.
   */
  optionGap?: number;
  /** Overrides the quiz-level timer. `null` means untimed. */
  timerSeconds?: number | null;
  /** Overrides the quiz-level base points. */
  points?: number;
  /** Overrides the quiz-wide cues, slot by slot. */
  cues?: CueSet;
}

/** Audience the quiz is coloured for. Affects palette only, never gameplay. */
export type AgeBand = "3-5" | "6-8" | "9-12" | "13-16";

export type ThemePreset = "neon" | "sunset" | "forest" | "candy" | "mono" | AgeBand;

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
  /**
   * Per-element text colours. All optional — unset means "use the built-in
   * default", which is what keeps quizzes saved before these existed looking
   * exactly as they did.
   */
  promptColor?: string;
  titleColor?: string;
  /** Unset means each tile picks black or white by contrast against its own colour. */
  optionTextColor?: string;
  explanationColor?: string;
  /** Marker style for every answer tile. Unset means the default shapes. */
  optionMarker?: OptionMarker;
  /**
   * Quiz-wide answer tile colours, one per palette slot. Unset — or a blank
   * entry — leaves that slot to the age band's palette.
   */
  optionColors?: string[];
  /** Colour a correct answer turns on reveal. Unset means green. */
  correctColor?: string;
  /** Colour a wrong pick turns on reveal. Unset means red. */
  wrongColor?: string;
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
  /**
   * Quiz-wide animation and sound cues. New quizzes start with a small post pack
   * (countdown, confetti, etc.); clear a slot to silence it.
   */
  cues: CueSet;
  progressStyle: ProgressStyle;
  progressPulse: ProgressPulse;
  /**
   * The character that walks the "mascot" meter. Any character or emoji, same
   * as an answer tile's icon — blank falls back to the default.
   */
  progressMascot: string;
  /**
   * An uploaded picture or GIF for the mascot meter. Wins over the character
   * when set; an animated GIF keeps animating, so it can carry its own walk.
   */
  progressMascotMedia?: MediaRef;
  /** The quiz-wide progress meter. Shares the mascot with the timer. */
  quizProgressStyle: QuizProgressStyle;
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
    if (q.kind === "image-choice") {
      if (q.options.length > 100) {
        issues.push({
          questionId: q.id,
          severity: "error",
          message: `${label} has too many answers (max 100 for image answers).`,
        });
      }
      const withMedia = q.options.filter((o) => o.media).length;
      if (withMedia < 2) {
        issues.push({
          questionId: q.id,
          severity: "error",
          message: `${label} needs at least 2 answers with images.`,
        });
      }
      const correctCount = q.options.filter((o) => o.correct).length;
      if (correctCount !== 1) {
        issues.push({
          questionId: q.id,
          severity: "error",
          message:
            correctCount === 0
              ? `${label} has no correct answer marked.`
              : `${label} must have exactly one correct answer.`,
        });
      }
    } else if (!q.options.some((o) => o.correct)) {
      issues.push({ questionId: q.id, severity: "error", message: `${label} has no correct answer marked.` });
    }
    if (q.options.some((o) => !o.text.trim() && !o.media)) {
      issues.push({ questionId: q.id, severity: "warning", message: `${label} has a blank answer option.` });
    }
  });

  return issues;
}
