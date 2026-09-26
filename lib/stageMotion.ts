/**
 * Entrance / exit animation for the question block (prompt + picture) and the
 * answer tiles — resolved from quiz-wide settings plus per-question overrides,
 * and evaluated as pure functions of elapsed time.
 *
 * Nothing here reads a clock. The live stage feeds it `performance.now()`
 * deltas; the video exporter feeds it `t = frame / fps`. Same inputs, same
 * pose, so an export can't drift from what plays.
 *
 * `default` means "exactly what the app did before these settings existed":
 * the stage-wide swap (QUESTION_SWAP) for the question and the staggered
 * tile-in (TILE_IN) for the answers. Live play keeps drawing `default` with the
 * original motion/CSS; `answerPoseAt` still models it so the exporter can.
 *
 * Runtime imports are relative with extensions so `node --test` can load this.
 */

import type {
  ElementMotion,
  EnterEffect,
  ExitEffect,
  MotionEasing,
  MotionOverrides,
  Question,
  QuizSettings,
} from "@/types/quiz";
import { QUESTION_SWAP, STAGE_MOTION, TILE_IN, tileDelayMs } from "./playTiming.ts";
import { clamp01, cubicBezier, lerp } from "./videoExport/motion.ts";

export interface ResolvedMotion {
  question: ElementMotion;
  answers: ElementMotion;
}

export const DEFAULT_QUESTION_MOTION: ElementMotion = {
  enter: "default",
  exit: "default",
  durationMs: 450,
  easing: "smooth",
  staggerMs: 0,
};

export const DEFAULT_ANSWER_MOTION: ElementMotion = {
  enter: "default",
  exit: "default",
  durationMs: TILE_IN.durationMs,
  easing: "smooth",
  staggerMs: TILE_IN.staggerMs,
};

export const DEFAULT_MOTION: ResolvedMotion = { question: DEFAULT_QUESTION_MOTION, answers: DEFAULT_ANSWER_MOTION };

/* ---------------------------------------------------------------- catalogue */

export const ENTER_EFFECTS: { id: EnterEffect; label: string; questionOnly?: boolean }[] = [
  { id: "default", label: "Default (today's look)" },
  { id: "none", label: "None (appear instantly)" },
  { id: "fade", label: "Fade in" },
  { id: "slide-up", label: "Slide up" },
  { id: "slide-down", label: "Slide down" },
  { id: "slide-left", label: "Slide in from right" },
  { id: "slide-right", label: "Slide in from left" },
  { id: "pop", label: "Pop" },
  { id: "zoom", label: "Zoom in" },
  { id: "bounce", label: "Bounce" },
  { id: "flip", label: "Flip" },
  { id: "typewriter", label: "Typewriter", questionOnly: true },
];

export const EXIT_EFFECTS: { id: ExitEffect; label: string }[] = [
  { id: "default", label: "Default (today's look)" },
  { id: "none", label: "None (disappear)" },
  { id: "fade", label: "Fade out" },
  { id: "slide-up", label: "Slide up" },
  { id: "slide-down", label: "Slide down" },
  { id: "slide-left", label: "Slide out left" },
  { id: "slide-right", label: "Slide out right" },
  { id: "pop", label: "Shrink" },
  { id: "zoom", label: "Zoom out" },
  { id: "flip", label: "Flip away" },
];

export const EASING_OPTIONS: { id: MotionEasing; label: string }[] = [
  { id: "smooth", label: "Smooth (app default)" },
  { id: "ease-out", label: "Ease out" },
  { id: "ease-in-out", label: "Ease in-out" },
  { id: "snappy", label: "Snappy (overshoot)" },
  { id: "linear", label: "Linear" },
];

const ENTER_IDS = new Set<string>(ENTER_EFFECTS.map((e) => e.id));
const EXIT_IDS = new Set<string>(EXIT_EFFECTS.map((e) => e.id));
const EASING_IDS = new Set<string>(EASING_OPTIONS.map((e) => e.id));

/* --------------------------------------------------------------- resolution */

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  const n = Number(value);
  if (value === undefined || value === null || !Number.isFinite(n)) return undefined;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Drops anything unknown or out of range, so a hand-edited import can't break the stage. */
function sanitize(part: Partial<ElementMotion> | undefined, element: "question" | "answers"): Partial<ElementMotion> {
  if (!part || typeof part !== "object") return {};
  const out: Partial<ElementMotion> = {};
  if (typeof part.enter === "string" && ENTER_IDS.has(part.enter)) {
    // Typewriter is text-only; on answers it falls back to the default.
    if (!(element === "answers" && part.enter === "typewriter")) out.enter = part.enter;
  }
  if (typeof part.exit === "string" && EXIT_IDS.has(part.exit)) out.exit = part.exit;
  if (typeof part.easing === "string" && EASING_IDS.has(part.easing)) out.easing = part.easing;
  const duration = clampNumber(part.durationMs, STAGE_MOTION.minDurationMs, STAGE_MOTION.maxDurationMs);
  if (duration !== undefined) out.durationMs = duration;
  const stagger = clampNumber(part.staggerMs, 0, STAGE_MOTION.maxStaggerMs);
  if (stagger !== undefined) out.staggerMs = stagger;
  return out;
}

function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as Partial<T>;
}

/**
 * Field by field: the question's override, else the quiz's setting, else
 * today's default. A question with no `motion` — every quiz saved before this
 * existed — resolves to exactly the quiz's motion, and a quiz with no `motion`
 * resolves to DEFAULT_MOTION.
 */
export function resolveMotion(
  settings: Pick<QuizSettings, "motion"> | undefined,
  question?: Pick<Question, "motion">,
): ResolvedMotion {
  const quiz = settings?.motion;
  const own = question?.motion;
  return {
    question: {
      ...DEFAULT_QUESTION_MOTION,
      ...definedOnly(sanitize(quiz?.question, "question")),
      ...definedOnly(sanitize(own?.question, "question")),
    },
    answers: {
      ...DEFAULT_ANSWER_MOTION,
      ...definedOnly(sanitize(quiz?.answers, "answers")),
      ...definedOnly(sanitize(own?.answers, "answers")),
    },
  };
}

/** True when a question follows the quiz for that element (the "Use global" state). */
export function usesGlobal(question: Pick<Question, "motion">, element: keyof MotionOverrides): boolean {
  const part = question.motion?.[element];
  return !part || Object.keys(part).length === 0;
}

/** "Reset to global": drops the question's override for one element (or both). */
export function resetToGlobal<Q extends Pick<Question, "motion">>(question: Q, element?: keyof MotionOverrides): Q {
  if (!element) {
    const { motion: _drop, ...rest } = question;
    void _drop;
    return rest as Q;
  }
  const motion: MotionOverrides = { ...question.motion };
  delete motion[element];
  if (!motion.question && !motion.answers) {
    const { motion: _drop, ...rest } = question;
    void _drop;
    return rest as Q;
  }
  return { ...question, motion };
}

export function isDefaultMotion(motion: ResolvedMotion): boolean {
  return (
    motion.question.enter === "default" &&
    motion.question.exit === "default" &&
    motion.answers.enter === "default" &&
    motion.answers.exit === "default"
  );
}

/* ------------------------------------------------------------------ easing */

const backOut = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
};

const backIn = (t: number) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t);
  return c3 * x * x * x - c1 * x * x;
};

export function bounceOut(t: number): number {
  const x = clamp01(t);
  const n1 = 7.5625;
  const d1 = 2.75;
  if (x < 1 / d1) return n1 * x * x;
  if (x < 2 / d1) return n1 * (x - 1.5 / d1) ** 2 + 0.75;
  if (x < 2.5 / d1) return n1 * (x - 2.25 / d1) ** 2 + 0.9375;
  return n1 * (x - 2.625 / d1) ** 2 + 0.984375;
}

export const EASINGS: Record<MotionEasing, (t: number) => number> = {
  smooth: cubicBezier(QUESTION_SWAP.ease),
  linear: (t) => clamp01(t),
  "ease-in-out": cubicBezier([0.42, 0, 0.58, 1]),
  "ease-out": cubicBezier([0, 0, 0.58, 1]),
  snappy: backOut,
};

const tileInEase = cubicBezier(TILE_IN.ease);

/* -------------------------------------------------------------------- poses */

/** A 2D-ish transform both renderers can apply. Lengths in CSS px, angles in degrees. */
export interface Pose {
  opacity: number;
  x: number;
  y: number;
  scale: number;
  rotateX: number;
}

export const REST_POSE: Pose = { opacity: 1, x: 0, y: 0, scale: 1, rotateX: 0 };

/** `raw` is linear progress 0→1 through the entrance. */
export function enterPose(effect: EnterEffect, raw: number, easing: MotionEasing): Pose {
  const r = clamp01(raw);
  if (r >= 1 || effect === "none" || effect === "default" || effect === "typewriter") return REST_POSE;
  const p = EASINGS[easing](r);
  const d = STAGE_MOTION.slidePx;
  switch (effect) {
    case "fade":
      return { ...REST_POSE, opacity: clamp01(p) };
    case "slide-up":
      return { ...REST_POSE, opacity: clamp01(p), y: d * (1 - p) };
    case "slide-down":
      return { ...REST_POSE, opacity: clamp01(p), y: -d * (1 - p) };
    case "slide-left":
      return { ...REST_POSE, opacity: clamp01(p), x: d * (1 - p) };
    case "slide-right":
      return { ...REST_POSE, opacity: clamp01(p), x: -d * (1 - p) };
    case "pop":
      // Pop and bounce carry their own curves; the easing setting doesn't apply.
      return { ...REST_POSE, opacity: clamp01(r * 2.5), scale: lerp(STAGE_MOTION.popScale, 1, backOut(r)) };
    case "zoom":
      return { ...REST_POSE, opacity: clamp01(p), scale: lerp(STAGE_MOTION.zoomScale, 1, p) };
    case "bounce":
      return { ...REST_POSE, opacity: clamp01(r * 4), y: -STAGE_MOTION.bouncePx * (1 - bounceOut(r)) };
    case "flip":
      return { ...REST_POSE, opacity: clamp01(p * 1.5), rotateX: STAGE_MOTION.flipDeg * (1 - p) };
  }
}

/** `raw` is linear progress 0→1 through the exit; 1 is fully gone. */
export function exitPose(effect: ExitEffect, raw: number, easing: MotionEasing): Pose {
  const r = clamp01(raw);
  if (effect === "none" || effect === "default") return REST_POSE;
  if (r <= 0) return REST_POSE;
  const q = EASINGS[easing](r);
  const d = STAGE_MOTION.slidePx;
  const fade = clamp01(1 - q);
  switch (effect) {
    case "fade":
      return { ...REST_POSE, opacity: fade };
    case "slide-up":
      return { ...REST_POSE, opacity: fade, y: -d * q };
    case "slide-down":
      return { ...REST_POSE, opacity: fade, y: d * q };
    case "slide-left":
      return { ...REST_POSE, opacity: fade, x: -d * q };
    case "slide-right":
      return { ...REST_POSE, opacity: fade, x: d * q };
    case "pop":
      return { ...REST_POSE, opacity: clamp01(1 - r), scale: lerp(1, STAGE_MOTION.popScale, Math.max(0, backIn(r))) };
    case "zoom":
      return { ...REST_POSE, opacity: fade, scale: lerp(1, STAGE_MOTION.zoomScale, q) };
    case "flip":
      return { ...REST_POSE, opacity: fade, rotateX: -STAGE_MOTION.flipDeg * q };
  }
}

/** The pose after both effects: an exit (once started) wins over the entrance. */
function combine(enter: Pose, exit: Pose | null): Pose {
  if (!exit) return enter;
  return {
    opacity: enter.opacity * exit.opacity,
    x: enter.x + exit.x,
    y: enter.y + exit.y,
    scale: enter.scale * exit.scale,
    rotateX: enter.rotateX + exit.rotateX,
  };
}

/* ------------------------------------------------------------------ timing */

/** How long the question text takes to type out. */
export function typewriterMs(text: string, motion: ElementMotion): number {
  const byLength = [...text].length * STAGE_MOTION.typewriterMsPerChar;
  return Math.min(STAGE_MOTION.typewriterMaxMs, Math.max(motion.durationMs, byLength));
}

/** Characters of `text` visible `sinceMount` ms after the question appears. */
export function typewriterChars(text: string, motion: ElementMotion, sinceMount: number): number {
  const chars = [...text].length;
  if (motion.enter !== "typewriter") return chars;
  return Math.min(chars, Math.floor(clamp01(sinceMount / typewriterMs(text, motion)) * chars + 1e-9));
}

/** Start offset of answer tile `index`'s own animation. */
export function answerDelayMs(motion: ElementMotion, index: number): number {
  if (motion.enter === "default") return tileDelayMs(index);
  return Math.min(index, STAGE_MOTION.maxStaggerSteps) * motion.staggerMs;
}

function answerExitDelayMs(motion: ElementMotion, index: number): number {
  return Math.min(index, STAGE_MOTION.maxStaggerSteps) * motion.staggerMs;
}

function hasCustomEnter(m: ElementMotion): boolean {
  return m.enter !== "default" && m.enter !== "none";
}

function hasCustomExit(m: ElementMotion): boolean {
  return m.exit !== "default" && m.exit !== "none";
}

/** How long entrances keep changing after mount (0 when only `default`/`none` are used). */
export function enterSpanMs(motion: ResolvedMotion, answerCount: number, prompt: string): number {
  let span = 0;
  if (hasCustomEnter(motion.question)) {
    span = motion.question.enter === "typewriter" ? typewriterMs(prompt, motion.question) : motion.question.durationMs;
  }
  if (hasCustomEnter(motion.answers)) {
    span = Math.max(span, answerDelayMs(motion.answers, Math.max(0, answerCount - 1)) + motion.answers.durationMs);
  }
  return span;
}

/** Custom exits only — how long the leaving question must stay mounted for them. */
export function customExitMs(motion: ResolvedMotion, answerCount: number): number {
  let span = 0;
  if (hasCustomExit(motion.question)) span = motion.question.durationMs;
  if (hasCustomExit(motion.answers)) {
    span = Math.max(span, answerExitDelayMs(motion.answers, Math.max(0, answerCount - 1)) + motion.answers.durationMs);
  }
  return span;
}

/** The stage-wide sideways swap is part of the question's `default` look. */
export function usesSwapIn(motion: ResolvedMotion): boolean {
  return motion.question.enter === "default";
}

export function usesSwapOut(motion: ResolvedMotion): boolean {
  return motion.question.exit === "default";
}

/**
 * When the stage-wide swap-out starts, measured from the moment the question
 * starts leaving. Custom exits play first and the swap (if the question still
 * uses it) follows, so a custom answer exit isn't faded away underneath it.
 */
export function swapOutDelayMs(motion: ResolvedMotion, answerCount: number): number {
  return customExitMs(motion, answerCount);
}

/**
 * How long the leaving question holds the stage before the next one mounts
 * (AnimatePresence mode="wait"): its custom exits, then the swap-out if the
 * question uses it. All-default is exactly today's QUESTION_SWAP duration.
 */
export function exitPhaseMs(motion: ResolvedMotion, answerCount: number): number {
  const swap = usesSwapOut(motion) ? QUESTION_SWAP.durationS * 1000 : 0;
  return customExitMs(motion, answerCount) + swap;
}

/**
 * The question block's pose. `sinceExit` is null until the question starts
 * leaving. `default`/`none` entrances rest here (the stage swap animates the
 * whole stage for `default`).
 */
export function questionPoseAt(motion: ElementMotion, sinceMount: number, sinceExit: number | null): Pose {
  const enter =
    hasCustomEnter(motion) && motion.enter !== "typewriter"
      ? enterPose(motion.enter, sinceMount / motion.durationMs, motion.easing)
      : REST_POSE;
  const exit =
    sinceExit !== null && hasCustomExit(motion)
      ? exitPose(motion.exit, sinceExit / motion.durationMs, motion.easing)
      : null;
  return combine(enter, exit);
}

/** Answer tile `index`'s pose, including today's tile-in for `default`. */
export function answerPoseAt(motion: ElementMotion, index: number, sinceMount: number, sinceExit: number | null): Pose {
  let enter: Pose;
  if (motion.enter === "default") {
    // `.animate-tile-in`: opacity 0→1, translateY(10px)→0, scale(.97)→1.
    const e = tileInEase(clamp01((sinceMount - tileDelayMs(index)) / TILE_IN.durationMs));
    enter = { ...REST_POSE, opacity: e, y: 10 * (1 - e), scale: lerp(0.97, 1, e) };
  } else if (motion.enter === "none") {
    enter = REST_POSE;
  } else {
    enter = enterPose(motion.enter, (sinceMount - answerDelayMs(motion, index)) / motion.durationMs, motion.easing);
  }
  const exit =
    sinceExit !== null && hasCustomExit(motion)
      ? exitPose(motion.exit, (sinceExit - answerExitDelayMs(motion, index)) / motion.durationMs, motion.easing)
      : null;
  return combine(enter, exit);
}

/** CSS for a pose. `perspective` gives the flip some depth, like the canvas's foreshortening. */
export function isRestPose(pose: Pose): boolean {
  return pose.opacity === 1 && pose.x === 0 && pose.y === 0 && pose.scale === 1 && pose.rotateX === 0;
}

/** Undefined at rest, so a settled element carries no inline transform at all. */
export function poseStyle(pose: Pose): { opacity: number; transform: string } | undefined {
  if (isRestPose(pose)) return undefined;
  const parts: string[] = [];
  if (pose.rotateX) parts.push("perspective(800px)");
  if (pose.x || pose.y) parts.push(`translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px)`);
  if (pose.scale !== 1) parts.push(`scale(${pose.scale.toFixed(4)})`);
  if (pose.rotateX) parts.push(`rotateX(${pose.rotateX.toFixed(2)}deg)`);
  return { opacity: pose.opacity, transform: parts.join(" ") || "none" };
}
