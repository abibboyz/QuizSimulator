/**
 * Which stored pictures and sounds a quiz uses, and rewriting their ids.
 * Pure — no IndexedDB — so storage, import/export and `node --test` share it.
 */

import type { MediaRef, Quiz } from "@/types/quiz";
import { mapCueSet, quizCueRefs } from "./cues.ts";

/**
 * Every media reference used anywhere in a quiz — including the theme's
 * background picture, every cue's, and Reveal covers. Miss one and the garbage
 * collector deletes it out from under a saved quiz (and export leaves it out).
 */
export function collectRefs(quiz: Quiz): MediaRef[] {
  const refs: MediaRef[] = [];
  if (quiz.theme?.bgImage) refs.push(quiz.theme.bgImage);
  for (const q of quiz.questions) {
    if (q.media) refs.push(q.media);
    for (const o of q.options) if (o.media) refs.push(o.media);
    // Kept whatever the kind, so flipping a question away from Reveal and
    // back doesn't lose its cover to the garbage collector.
    if (q.reveal?.cover) refs.push(q.reveal.cover);
  }
  refs.push(...quizCueRefs(quiz));
  if (quiz.settings?.progressMascotMedia) refs.push(quiz.settings.progressMascotMedia);
  return refs;
}

/** Rewrites stored-media ids through a mapping (used when copying/importing). */
export function remapMedia(quiz: Quiz, remap: Map<string, string>): Quiz {
  const swap = (ref?: MediaRef): MediaRef | undefined => {
    if (!ref || ref.kind !== "stored") return ref;
    const next = remap.get(ref.id);
    return next ? { ...ref, id: next } : ref;
  };

  return {
    ...quiz,
    theme: { ...quiz.theme, bgImage: swap(quiz.theme?.bgImage) },
    settings: {
      ...quiz.settings,
      cues: mapCueSet(quiz.settings?.cues, swap) ?? {},
      progressMascotMedia: swap(quiz.settings?.progressMascotMedia),
    },
    questions: quiz.questions.map((q) => ({
      ...q,
      media: swap(q.media),
      options: q.options.map((o) => ({ ...o, media: swap(o.media) })),
      cues: mapCueSet(q.cues, swap),
      // Only questions that have reveal settings get the key — older quizzes come back byte-identical.
      ...(q.reveal ? { reveal: { ...q.reveal, cover: swap(q.reveal.cover) } } : {}),
    })),
  };
}
