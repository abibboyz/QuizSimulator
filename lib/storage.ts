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
import type { Quiz, QuizSummary } from "@/types/quiz";
import { toSummary } from "@/types/quiz";
import { DEFAULT_SETTINGS, newId } from "@/lib/factory";
import { DEFAULT_THEME } from "@/lib/themes";
import { collectRefs, remapMedia } from "@/lib/mediaRefs";
import { normalizeRevealQuestion } from "@/lib/reveal";

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
    questions: quiz.questions.map(normalizeKind),
  };
}

/** Older builds saved a picture-round kind. Those questions are image answers now. */
function normalizeKind(question: Quiz["questions"][number]): Quiz["questions"][number] {
  if ((question.kind as string) !== "image-identification") return normalizeRevealQuestion(question);
  const marked = question.options.findIndex((option) => option.correct);
  const keep = marked === -1 ? 0 : marked;
  return normalizeRevealQuestion({
    ...question,
    kind: "image-choice",
    layout: question.layout === "big-text" ? "grid" : question.layout,
    options: question.options.map((option, index) => ({ ...option, correct: index === keep })),
  });
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

// Pure (no IndexedDB), so they live where `node --test` can reach them.
export { collectRefs, remapMedia } from "@/lib/mediaRefs";

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
