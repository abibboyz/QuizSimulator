/**
 * Which stored pictures and sounds a quiz uses, and rewriting their ids.
 * Pure — no IndexedDB — so storage, import/export and `node --test` share it.
 */

import type { CueSet, MediaRef, Quiz } from "@/types/quiz";
import { mapCueSet, quizCueRefs } from "./cues.ts";

/** Same key the video renderer uses to look a picture up once it is loaded. */
export function mediaKey(ref: MediaRef): string {
  return ref.kind === "stored" ? `s:${ref.id}` : `u:${ref.url}`;
}

function cueImages(set: CueSet | undefined): MediaRef[] {
  if (!set) return [];
  return Object.values(set).flatMap((cue) => (cue?.media ? [cue.media] : []));
}

/**
 * Every picture a solo run can show. Cue sounds stay out (audio.ts loads those).
 * A question background counts only while it is enabled, because that is when
 * play replaces the quiz background with it.
 */
export function imageRefs(quiz: Quiz): MediaRef[] {
  const refs: MediaRef[] = [];
  if (quiz.theme?.bgImage) refs.push(quiz.theme.bgImage);
  if (quiz.settings?.progressMascotMedia) refs.push(quiz.settings.progressMascotMedia);
  refs.push(...cueImages(quiz.settings?.cues));
  for (const q of quiz.questions) {
    if (q.media) refs.push(q.media);
    if (q.background?.enabled && q.background.image) refs.push(q.background.image);
    for (const o of q.options) if (o.media) refs.push(o.media);
    if (q.kind === "reveal" && q.reveal?.cover) refs.push(q.reveal.cover);
    // Shown only while the celebration is on. A saved-but-disabled picture stays
    // out of the play/export load, same as a disabled question background.
    if (q.celebration?.enabled && q.celebration.image) refs.push(q.celebration.image);
    refs.push(...cueImages(q.cues));
  }
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = mediaKey(ref);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Every media reference used anywhere in a quiz — including the theme's
 * background picture, every cue's, and Reveal covers. Miss one and the garbage
 * collector deletes it out from under a saved quiz (and export leaves it out).
 */
export function collectRefs(quiz: Quiz): MediaRef[] {
  const refs: MediaRef[] = [];
  if (quiz.theme?.bgImage) refs.push(quiz.theme.bgImage);
  for (const q of quiz.questions) {
    if (q.background?.image) refs.push(q.background.image);
    if (q.media) refs.push(q.media);
    for (const o of q.options) if (o.media) refs.push(o.media);
    // Kept whatever the kind, so flipping a question away from Reveal and
    // back doesn't lose its cover to the garbage collector.
    if (q.reveal?.cover) refs.push(q.reveal.cover);
    // Kept while the switch is off, so turning it back on still has the picture.
    if (q.celebration?.image) refs.push(q.celebration.image);
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
      ...(q.background ? { background: { ...q.background, image: swap(q.background.image) } } : {}),
      options: q.options.map((o) => ({ ...o, media: swap(o.media) })),
      cues: mapCueSet(q.cues, swap),
      // Only questions that have reveal settings get the key — older quizzes come back byte-identical.
      ...(q.reveal ? { reveal: { ...q.reveal, cover: swap(q.reveal.cover) } } : {}),
      // Only questions that have a celebration get the key — older quizzes come back byte-identical.
      ...(q.celebration ? { celebration: { ...q.celebration, image: swap(q.celebration.image) } } : {}),
    })),
  };
}
