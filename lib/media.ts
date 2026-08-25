/**
 * Image intake. Every picture is downscaled and re-encoded before it is stored:
 * a 6MB phone photo lands around 200KB with no visible loss on a projector.
 * Skipping this would bloat the database and make exports too big to send.
 */

import type { MediaRef } from "@/types/quiz";
import { newId } from "@/lib/factory";
import { putMediaRecord } from "@/lib/storage";

export const MAX_DIM = 1600;
const QUALITY = 0.85;

/**
 * Animated files are stored byte-for-byte. Everything else gets downscaled, but
 * a GIF pushed through a canvas comes out as a single frozen frame — so the
 * size cap is the only protection here, and it has to be generous enough to be
 * useful and tight enough to keep exports sendable.
 */
const MAX_ANIMATED_BYTES = 12 * 1024 * 1024;

export class MediaError extends Error {}

export async function putImage(file: File | Blob): Promise<MediaRef> {
  if (!file.type.startsWith("image/")) {
    throw new MediaError("That file isn't an image.");
  }

  if (await isAnimated(file)) return storeAsIs(file);

  const source = await decode(file);
  const { width, height } = fit(source.width, source.height, MAX_DIM);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) throw new MediaError("Couldn't process that image.");
  context.imageSmoothingQuality = "high";
  context.drawImage(source.image, 0, 0, width, height);

  if ("close" in source.image) source.image.close();

  const blob = await encode(canvas);
  const id = newId();
  await putMediaRecord({ id, blob, w: width, h: height, createdAt: Date.now() });

  return { kind: "stored", id, w: width, h: height };
}

/** GIF and APNG are always treated as animated; WebP carries an ANIM chunk. */
async function isAnimated(file: File | Blob): Promise<boolean> {
  if (file.type === "image/gif" || file.type === "image/apng") return true;
  if (file.type !== "image/webp") return false;

  try {
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const text = new TextDecoder("latin1").decode(head);
    return text.startsWith("RIFF") && text.includes("ANIM");
  } catch {
    return false;
  }
}

/** Keeps the original bytes so the animation survives. */
async function storeAsIs(file: File | Blob): Promise<MediaRef> {
  if (file.size > MAX_ANIMATED_BYTES) {
    throw new MediaError(
      `That animation is ${formatBytes(file.size)}. Keep it under ${formatBytes(MAX_ANIMATED_BYTES)} so the quiz stays quick to load and export.`,
    );
  }

  // The first frame is enough to learn the dimensions.
  const source = await decode(file);
  const { width, height } = source;
  if ("close" in source.image) source.image.close();

  const id = newId();
  await putMediaRecord({ id, blob: file, w: width, h: height, createdAt: Date.now() });
  return { kind: "stored", id, w: width, h: height };
}

interface Decoded {
  image: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
}

async function decode(file: File | Blob): Promise<Decoded> {
  // createImageBitmap is the fast path, but it rejects on SVG in some browsers.
  if (typeof createImageBitmap === "function" && file.type !== "image/svg+xml") {
    try {
      const bitmap = await createImageBitmap(file);
      return { image: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      /* fall through to the <img> path */
    }
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new MediaError("That image couldn't be read."));
      el.src = url;
    });
    return { image: img, width: img.naturalWidth || MAX_DIM, height: img.naturalHeight || MAX_DIM };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function encode(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const done = (blob: Blob | null) => {
      if (blob) return resolve(blob);
      // Very old Safari can't encode WebP; JPEG is the universal fallback.
      canvas.toBlob(
        (jpeg) => (jpeg ? resolve(jpeg) : reject(new MediaError("Couldn't encode that image."))),
        "image/jpeg",
        QUALITY,
      );
    };
    canvas.toBlob(done, "image/webp", QUALITY);
  });
}

function fit(width: number, height: number, max: number) {
  if (width <= max && height <= max) return { width, height };
  const scale = Math.min(max / width, max / height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/** Pulls the first image out of a drop or paste event, if there is one. */
export function imageFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;

  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  for (const file of Array.from(data.files ?? [])) {
    if (file.type.startsWith("image/")) return file;
  }
  return null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ audio */

/**
 * Audio is stored byte-for-byte — there is no equivalent of downscaling, and
 * re-encoding in the browser would mean shipping a codec. The cap is tighter
 * than the animation one because a cue fires repeatedly during a run and every
 * byte also lands in the export as base64.
 */
const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

export async function putAudio(file: File | Blob): Promise<MediaRef> {
  if (!file.type.startsWith("audio/")) {
    throw new MediaError("That file isn't a sound.");
  }
  if (file.size > MAX_AUDIO_BYTES) {
    throw new MediaError(
      `That sound is ${formatBytes(file.size)}. Keep it under ${formatBytes(MAX_AUDIO_BYTES)} so the quiz stays quick to load and export.`,
    );
  }

  // Width and height are meaningless for a sound, but the media store is shared
  // with images so that every blob is reachable by one garbage collector rather
  // than two. Zeroes are the honest value.
  const id = newId();
  await putMediaRecord({ id, blob: file, w: 0, h: 0, createdAt: Date.now() });
  return { kind: "stored", id, w: 0, h: 0 };
}

/** Pulls an audio file out of a drop or paste, ignoring anything else. */
export function audioFromTransfer(data: DataTransfer | null): File | null {
  if (!data) return null;
  for (const item of Array.from(data.files)) {
    if (item.type.startsWith("audio/")) return item;
  }
  return null;
}
