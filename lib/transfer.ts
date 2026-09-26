/**
 * Import/export. A quiz exports as one self-contained .json with its images
 * inlined as data URIs, so a single file is the whole quiz — nothing to keep
 * alongside it, nothing to break when it's emailed or dropped in a repo.
 */

import type { MediaRef, Quiz } from "@/types/quiz";
import { SCHEMA_VERSION, schemaVersionFor } from "@/types/quiz";
import { newId } from "@/lib/factory";
import { collectRefs, getMedia, putMediaRecord, remapMedia, saveQuiz } from "@/lib/storage";
import { normalizeRevealQuestion } from "@/lib/reveal";

const APP_TAG = "quiz-simulator";

export interface QuizBundle {
  app: typeof APP_TAG;
  schemaVersion: number;
  exportedAt: number;
  quiz: Quiz;
  media: Record<string, { dataUrl: string; w: number; h: number }>;
}

export class TransferError extends Error {}

export async function buildBundle(quiz: Quiz): Promise<QuizBundle> {
  const media: QuizBundle["media"] = {};

  for (const ref of collectRefs(quiz)) {
    if (ref.kind !== "stored" || media[ref.id]) continue;
    const record = await getMedia(ref.id);
    if (!record) continue;
    media[ref.id] = { dataUrl: await blobToDataUrl(record.blob), w: record.w, h: record.h };
  }

  // Stamped with the oldest schema that can carry it, so older builds still open files that use nothing new.
  return { app: APP_TAG, schemaVersion: schemaVersionFor(quiz), exportedAt: Date.now(), quiz, media };
}

export async function exportQuizFile(quiz: Quiz): Promise<number> {
  const bundle = await buildBundle(quiz);
  const json = JSON.stringify(bundle, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slug(quiz.title) || "quiz"}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);

  return blob.size;
}

/**
 * Reads a bundle back in. Every id is regenerated so importing a quiz twice —
 * or importing one you already have — can't collide with existing records.
 */
export async function importBundle(text: string): Promise<Quiz> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new TransferError("That file isn't valid JSON.");
  }

  const bundle = parsed as Partial<QuizBundle>;
  if (!bundle || typeof bundle !== "object" || bundle.app !== APP_TAG) {
    throw new TransferError("That doesn't look like a Quiz Simulator export.");
  }
  if (typeof bundle.schemaVersion !== "number" || bundle.schemaVersion > SCHEMA_VERSION) {
    throw new TransferError("That file was made by a newer version of this app.");
  }

  const source = bundle.quiz;
  if (!source || !Array.isArray(source.questions) || typeof source.title !== "string") {
    throw new TransferError("That export is missing its quiz data.");
  }

  // Restore blobs first so the remap table is ready before the quiz is rewritten.
  const remap = new Map<string, string>();
  for (const [oldId, entry] of Object.entries(bundle.media ?? {})) {
    if (!entry?.dataUrl) continue;
    const id = newId();
    await putMediaRecord({
      id,
      blob: dataUrlToBlob(entry.dataUrl),
      w: entry.w ?? 0,
      h: entry.h ?? 0,
      createdAt: Date.now(),
    });
    remap.set(oldId, id);
  }

  const withMedia = remapMedia(source as Quiz, remap);
  const now = Date.now();

  const quiz: Quiz = {
    ...withMedia,
    id: newId(),
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
    questions: withMedia.questions.map((q) =>
      normalizeRevealQuestion({
        ...q,
        id: newId(),
        options: (q.options ?? []).map((o) => ({ ...o, id: newId() })),
      }),
    ),
  };

  await saveQuiz(quiz);
  return quiz;
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new TransferError("Couldn't read that file."));
    reader.readAsText(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new TransferError("Couldn't encode an image for export."));
    reader.readAsDataURL(blob);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload] = dataUrl.split(",");
  const match = /data:([^;]+)/.exec(header ?? "");
  const type = match?.[1] ?? "image/webp";
  const binary = atob(payload ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

/** Convenience for the media-count badge in the export dialog. */
export function countStoredImages(quiz: Quiz): number {
  const ids = new Set<string>();
  for (const ref of collectRefs(quiz)) {
    if ((ref as MediaRef).kind === "stored") ids.add((ref as { id: string }).id);
  }
  return ids.size;
}
