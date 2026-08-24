/**
 * Which animation and sound belong to a given moment in a run, and where their
 * pictures live.
 *
 * Resolution is three-valued rather than a plain `??` chain on purpose: a
 * question whose slot is set to `null` is saying "stay quiet here", and that
 * has to beat the quiz-wide default. Only an *absent* key falls through.
 *
 * Imports here are type-only so the module stays runnable under `node --test`,
 * which strips types but can't resolve the `@/` alias.
 */

import type { Cue, CueSet, CueSlot, MediaRef, Question, Quiz } from "@/types/quiz";

/** Hold time used when an author hasn't picked one. */
export const DEFAULT_CUE_MS = 1500;

/** Every slot, in the order a run reaches them. Drives the builder's list. */
export const CUE_SLOTS: CueSlot[] = ["intro", "correct", "wrong", "between", "outro"];

/**
 * The slots a single question can override. `intro` and `outro` are quiz-level
 * moments — there is no question in scope when they fire, so `resolveCue` is
 * called with `undefined` for them and a per-question value could never be
 * read. Offering them in the editor would be a lie.
 */
export const PER_QUESTION_CUE_SLOTS: CueSlot[] = ["correct", "wrong", "between"];

export const CUE_SLOT_LABELS: Record<CueSlot, { label: string; hint: string }> = {
  intro: { label: "Quiz start", hint: "Before the first question" },
  correct: { label: "Correct answer", hint: "Every time a player gets one right" },
  wrong: { label: "Wrong answer", hint: "Every time a player misses" },
  between: { label: "Between questions", hint: "After an answer, before the next question" },
  outro: { label: "Results", hint: "When the quiz finishes" },
};

/**
 * Clamped so a hand-edited or imported value can't stall the run or flash past
 * before anyone sees it.
 */
export function cueHoldMs(cue: Cue): number {
  const ms = Number(cue.durationMs);
  if (!Number.isFinite(ms)) return DEFAULT_CUE_MS;
  return Math.min(15000, Math.max(200, Math.round(ms)));
}

/**
 * True when a cue would actually do something. An "image" animation with
 * nothing uploaded has no picture to draw, so it only counts if it also carries
 * a sound.
 */
export function cueEnabled(cue: Cue | null | undefined): cue is Cue {
  if (!cue) return false;
  if (cue.sound) return true;
  if (cue.animation === "image") return !!cue.media;
  return !!cue.animation;
}

export function resolveCue(
  quiz: Pick<Quiz, "settings">,
  question: Question | undefined,
  slot: CueSlot,
): Cue | null {
  // `in` rather than a truthiness check: an explicit null is a real answer.
  if (question?.cues && slot in question.cues) return question.cues[slot] ?? null;
  return quiz.settings.cues?.[slot] ?? null;
}

/** The cue for a slot, but only if it would play. Saves callers a double call. */
export function activeCue(
  quiz: Pick<Quiz, "settings">,
  question: Question | undefined,
  slot: CueSlot,
): Cue | null {
  const cue = resolveCue(quiz, question, slot);
  return cueEnabled(cue) ? cue : null;
}

/* --------------------------------------------------------------- cue media */

/**
 * Cue pictures are stored blobs like any other image, so the storage layer's
 * reference walk and id remapper have to see them. Missing either one means the
 * garbage collector eats them, or copying a quiz silently drops them.
 */
export function cueSetRefs(cues: CueSet | undefined): MediaRef[] {
  if (!cues) return [];
  return Object.values(cues).flatMap((cue) => (cue?.media ? [cue.media] : []));
}

export function quizCueRefs(quiz: Pick<Quiz, "settings" | "questions">): MediaRef[] {
  return [
    ...cueSetRefs(quiz.settings?.cues),
    ...quiz.questions.flatMap((question) => cueSetRefs(question.cues)),
  ];
}

/** Rewrites the stored-media ids inside a cue set, preserving explicit nulls. */
export function mapCueSet(
  cues: CueSet | undefined,
  swap: (ref?: MediaRef) => MediaRef | undefined,
): CueSet | undefined {
  if (!cues) return cues;
  const next: CueSet = {};
  for (const [slot, cue] of Object.entries(cues) as [CueSlot, Cue | null][]) {
    next[slot] = cue ? { ...cue, media: swap(cue.media) } : cue;
  }
  return next;
}
