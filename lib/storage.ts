/**
 * Persistence layer.
 *
 * IndexedDB rather than localStorage: quizzes carry images, and localStorage's
 * ~5MB string budget would blow out after a handful of photos — throwing
 * mid-save and losing work. IndexedDB stores real Blobs, scales to hundreds of
 * MB, and is already async, which is the right shape if this ever moves to a
 * server.
 *
 * Everything below is deliberately behind a small interface so swapping in a
 * remote backend later is a one-file change.
 */

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { MediaRef, Quiz, QuizSummary } from "@/types/quiz";
import { toSummary } from "@/types/quiz";
import { DEFAULT_SETTINGS, newId } from "@/lib/factory";
import { DEFAULT_THEME } from "@/lib/themes";
import { mapCueSet, quizCueRefs } from "@/lib/cues";

const DB_NAME = "quiz-simulator";
const DB_VERSION = 1;

export interface MediaRecord {
  id: string;
  blob: Blob;
  w: number;
  h: number;
  createdAt: number;
}

interface QuizDB extends DBSchema {
  quizzes: { key: string; value: Quiz };
  media: { key: string; value: MediaRecord };
}

let dbPromise: Promise<IDBPDatabase<QuizDB>> | null = null;

function db(): Promise<IDBPDatabase<QuizDB>> {
  if (typeof window === "undefined" || typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Storage is only available in the browser."));
  }
  if (!dbPromise) {
    dbPromise = openDB<QuizDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        if (!database.objectStoreNames.contains("quizzes")) {
          database.createObjectStore("quizzes", { keyPath: "id" });
        }
        if (!database.objectStoreNames.contains("media")) {
          database.createObjectStore("media", { keyPath: "id" });
        }
      },
    });
  }
  return dbPromise;
}

/* ---------------------------------------------------------------- quizzes */

/**
 * Fills in fields added after a quiz was saved. Without this, a quiz stored by
 * an older build reaches the UI with `undefined` settings and turns controlled
 * inputs into uncontrolled ones.
 */
function hydrate(quiz: Quiz): Quiz {
  return {
    ...quiz,
    theme: { ...DEFAULT_THEME, ...quiz.theme },
    settings: { ...DEFAULT_SETTINGS, ...quiz.settings },
  };
}

export async function listQuizzes(): Promise<QuizSummary[]> {
  const all = await (await db()).getAll("quizzes");
  return all.map((q) => toSummary(hydrate(q))).sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getQuiz(id: string): Promise<Quiz | null> {
  const found = await (await db()).get("quizzes", id);
  return found ? hydrate(found) : null;
}

export async function saveQuiz(quiz: Quiz): Promise<void> {
  await (await db()).put("quizzes", { ...quiz, updatedAt: Date.now() });
}

export async function removeQuiz(id: string): Promise<void> {
  await (await db()).delete("quizzes", id);
  await collectGarbage();
}

export async function duplicateQuiz(id: string): Promise<Quiz | null> {
  const source = await getQuiz(id);
  if (!source) return null;

  // Media blobs are copied rather than shared, so deleting either copy later
  // can't strip images out of the other one.
  const remap = new Map<string, string>();
  for (const ref of collectRefs(source)) {
    if (ref.kind !== "stored") continue;
    const record = await getMedia(ref.id);
    if (!record) continue;
    const copyId = newId();
    await putMediaRecord({ ...record, id: copyId, createdAt: Date.now() });
    remap.set(ref.id, copyId);
  }

  const copy: Quiz = {
    ...remapMedia(source, remap),
    id: newId(),
    title: `${source.title} (copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveQuiz(copy);
  return copy;
}

/* ------------------------------------------------------------------ media */

export async function putMediaRecord(record: MediaRecord): Promise<void> {
  await (await db()).put("media", record);
}

export async function getMedia(id: string): Promise<MediaRecord | null> {
  return (await (await db()).get("media", id)) ?? null;
}

export async function deleteMedia(id: string): Promise<void> {
  await (await db()).delete("media", id);
}

/**
 * Every media reference used anywhere in a quiz — including the theme's
 * background picture and every cue's. Miss one and the garbage collector
 * deletes it out from under a saved quiz.
 */
export function collectRefs(quiz: Quiz): MediaRef[] {
  const refs: MediaRef[] = [];
  if (quiz.theme?.bgImage) refs.push(quiz.theme.bgImage);
  for (const q of quiz.questions) {
    if (q.media) refs.push(q.media);
    for (const o of q.options) if (o.media) refs.push(o.media);
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
    })),
  };
}

/**
 * Drops media blobs no quiz references any more. Cheap enough to run on delete;
 * without it, removing a question would silently leak its image forever.
 */
export async function collectGarbage(): Promise<number> {
  const database = await db();
  const quizzes = await database.getAll("quizzes");

  const live = new Set<string>();
  for (const quiz of quizzes) {
    for (const ref of collectRefs(quiz)) {
      if (ref.kind === "stored") live.add(ref.id);
    }
  }

  const ids = await database.getAllKeys("media");
  const orphans = ids.filter((id) => !live.has(id));
  await Promise.all(orphans.map((id) => database.delete("media", id)));
  return orphans.length;
}

/** Rough footprint, shown on the dashboard so storage pressure isn't a surprise. */
export async function estimateUsage(): Promise<{ bytes: number; quota: number } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  const { usage = 0, quota = 0 } = await navigator.storage.estimate();
  return { bytes: usage, quota };
}
