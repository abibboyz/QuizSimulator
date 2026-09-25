/** Core data model. Everything the app stores or exports is described here. */

/**
 * 2 added the `reveal` question kind and the optional `motion` settings. Both
 * are additive: a version-1 quiz loads unchanged and resolves to exactly what
 * it looked like before. The bump only stops an older build from importing a
 * quiz it can't draw — see `schemaVersionFor`.
 */
export const SCHEMA_VERSION = 2;

/**
 * The oldest schema that can faithfully carry this quiz. Export files are
 * stamped with it, so a quiz that uses nothing new still opens in builds from
 * before version 2, and one with Reveal questions or animation settings is
 * refused there cleanly ("made by a newer version") instead of playing with
 * its hidden picture on show.
 */
export function schemaVersionFor(quiz: Pick<Quiz, "questions" | "settings">): number {
  const usesV2 =
    !!quiz.settings?.motion ||
    quiz.questions.some((q) => q.kind === "reveal" || q.reveal !== undefined || q.motion !== undefined);
  return usesV2 ? 2 : 1;
}

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
  /** A bright rising shimmer, made for uncovering a hidden picture. */
  | "reveal"
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

export type QuestionKind = "multiple-choice" | "true-false" | "multi-select" | "image-choice" | "reveal";

/* ----------------------------------------------------------------- reveal */

/**
 * How a Reveal question uncovers its picture when the answer is shown.
 *
 * Cover-based: the cover image (or its fallback) sits on top and is taken off.
 * Picture-based: `pixelate`, `blur` and `zoom` hide the answer picture itself
 * (blocky, blurred, or cropped in) and sharpen / pull back to reveal it — the
 * cover isn't drawn for those.
 */
export type RevealAnimation =
  | "tiles"
  | "pixelate"
  | "blur"
  | "zoom"
  | "curtain"
  | "wipe-left"
  | "wipe-right"
  | "wipe-up"
  | "wipe-down"
  | "iris"
  | "shatter"
  | "fade"
  | "flip";

/** What hides the picture when no cover image was uploaded. */
export type RevealCoverFallback = "color" | "blur";

/**
 * Stored as a partial and resolved against defaults (`resolveReveal`), so a
 * half-filled or hand-edited record still plays.
 */
export interface RevealSettings {
  animation: RevealAnimation;
  /** How long the uncovering takes. */
  durationMs: number;
  /** The picture that hides the answer. Unset uses `coverFallback`. */
  cover?: MediaRef;
  coverFallback: RevealCoverFallback;
  /** Fill for the "color" fallback. Unset uses the theme accent, darkened. */
  coverColor?: string;
  /** Grid columns for tiles / shatter; blocks across at the start of pixelate. */
  tiles: number;
  /** How far `zoom` starts cropped in (2 = twice as close). */
  zoom: number;
  /** Where `zoom` (and `iris`) centre on, 0–1 across and down the picture. */
  focusX: number;
  focusY: number;
  /** Shown under the picture once it's uncovered — usually the answer's name. */
  caption?: string;
  /** Played as the cover comes off. `null` is silent. */
  sound: CueSound | null;
}

/* ----------------------------------------------------------------- motion */

/**
 * `default` is today's motion, reproduced exactly: for the question, the stage
 * sliding in from the right (and out to the left) as questions change; for the
 * answers, the staggered tile-in. Everything else is opt-in.
 */
export type EnterEffect =
  | "default"
  | "none"
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "pop"
  | "zoom"
  | "bounce"
  | "flip"
  /** Question text only: types itself out. */
  | "typewriter";

export type ExitEffect =
  | "default"
  | "none"
  | "fade"
  | "slide-up"
  | "slide-down"
  | "slide-left"
  | "slide-right"
  | "pop"
  | "zoom"
  | "flip";

export type MotionEasing = "smooth" | "linear" | "ease-in-out" | "ease-out" | "snappy";

/** One element's entrance and exit. */
export interface ElementMotion {
  enter: EnterEffect;
  exit: ExitEffect;
  /** Per effect, entering and leaving. Ignored by `default` and `none`. */
  durationMs: number;
  easing: MotionEasing;
  /** Answers only: delay between one tile and the next. */
  staggerMs: number;
}

/**
 * Question text/picture and answer tiles animate separately. Every field is
 * optional: at quiz level a missing field means "today's default"; on a
 * question it means "use the quiz's setting".
 */
export interface MotionOverrides {
  question?: Partial<ElementMotion>;
  answers?: Partial<ElementMotion>;
}

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
  /**
   * Reveal questions: how `media` (the answer picture) is covered and then
   * uncovered. Ignored by other kinds, but kept so switching kind back and
   * forth doesn't lose it.
   */
  reveal?: Partial<RevealSettings>;
  /** Overrides the quiz-wide question/answer animations. Absent = use the quiz's. */
  motion?: MotionOverrides;
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
  /** Quiz-wide question/answer animations. Absent = today's motion. */
  motion?: MotionOverrides;
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
    const hasPicture = !!q.media || (q.kind === "image-choice" && q.options.some((option) => option.media));
    if (!q.prompt.trim() && !hasPicture) {
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
    } else if (q.kind === "reveal") {
      if (!q.media) {
        issues.push({
          questionId: q.id,
          severity: "error",
          message: `${label} needs an answer picture to reveal.`,
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
