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

export class MediaError extends Error {}

export async function putImage(file: File | Blob): Promise<MediaRef> {
  if (!file.type.startsWith("image/")) {
    throw new MediaError("That file isn't an image.");
  }

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
