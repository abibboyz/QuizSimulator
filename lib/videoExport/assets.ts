/**
 * Everything the frame renderer needs loaded before frame 0: decoded pictures
 * and the app's web fonts. Loading up front keeps rendering synchronous and
 * deterministic — no frame is ever drawn with a half-loaded image.
 */

import type { CueSet, MediaRef, Quiz } from "@/types/quiz";
import { getMedia } from "@/lib/storage";
import { mediaKey, type FontSet, type LoadedImage, type RenderAssets } from "@/lib/videoExport/renderer";

function cueImages(set: CueSet | undefined): MediaRef[] {
  if (!set) return [];
  return Object.values(set).flatMap((cue) => (cue?.media ? [cue.media] : []));
}

/** Every picture the run can show (cue *sounds* are handled by audio.ts). */
export function imageRefs(quiz: Quiz): MediaRef[] {
  const refs: MediaRef[] = [];
  if (quiz.theme?.bgImage) refs.push(quiz.theme.bgImage);
  if (quiz.settings?.progressMascotMedia) refs.push(quiz.settings.progressMascotMedia);
  refs.push(...cueImages(quiz.settings?.cues));
  for (const q of quiz.questions) {
    if (q.media) refs.push(q.media);
    for (const o of q.options) if (o.media) refs.push(o.media);
    if (q.kind === "reveal" && q.reveal?.cover) refs.push(q.reveal.cover);
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

async function decodeBlob(blob: Blob): Promise<LoadedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return { source: bitmap, width: bitmap.width, height: bitmap.height };
    } catch {
      // Fall through to an <img>, which decodes a few formats bitmaps don't (e.g. SVG).
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await decodeImageUrl(url, false);
  } finally {
    // The decoded <img> keeps its pixels after the URL is revoked.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

function decodeImageUrl(url: string, cors: boolean): Promise<LoadedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (cors) img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Couldn't load ${url}`));
    img.src = url;
  });
}

async function loadImage(ref: MediaRef): Promise<LoadedImage | null> {
  try {
    if (ref.kind === "stored") {
      const record = await getMedia(ref.id);
      return record ? await decodeBlob(record.blob) : null;
    }
    // Web images must allow CORS: drawing one that doesn't would taint the
    // canvas and make every frame unreadable to the encoder.
    try {
      const response = await fetch(ref.url, { mode: "cors" });
      if (response.ok) return await decodeBlob(await response.blob());
    } catch {
      // try the <img crossorigin> route below
    }
    return await decodeImageUrl(ref.url, true);
  } catch {
    return null;
  }
}

const FALLBACK_SANS = "ui-sans-serif, system-ui, sans-serif";
const FALLBACK_MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

function cssFamily(variable: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return value ? `${value}, ${fallback}` : fallback;
}

/** Resolves the next/font families the app uses and makes sure each weight is loaded. */
export async function loadFonts(): Promise<FontSet> {
  const fonts: FontSet = {
    sans: cssFamily("--font-geist-sans", FALLBACK_SANS),
    mono: cssFamily("--font-geist-mono", FALLBACK_MONO),
    display: cssFamily("--font-outfit", FALLBACK_SANS),
  };
  if (typeof document !== "undefined" && document.fonts?.load) {
    const loads: Promise<unknown>[] = [];
    for (const family of [fonts.sans, fonts.mono, fonts.display]) {
      for (const weight of [400, 500, 600, 700, 800]) {
        loads.push(document.fonts.load(`${weight} 16px ${family}`).catch(() => undefined));
      }
    }
    await Promise.all(loads);
  }
  return fonts;
}

export interface LoadedAssets {
  assets: RenderAssets;
  /** Pictures that couldn't be loaded (they're drawn as empty frames). */
  missingImages: number;
}

export async function loadAssets(
  quiz: Quiz,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal,
): Promise<LoadedAssets> {
  const refs = imageRefs(quiz);
  const images = new Map<string, LoadedImage>();
  let done = 0;
  let missingImages = 0;
  onProgress?.(0, refs.length);

  // A few at a time: image-choice questions can carry up to 100 pictures.
  const queue = [...refs];
  const worker = async () => {
    for (let ref = queue.shift(); ref; ref = queue.shift()) {
      signal?.throwIfAborted?.();
      const img = await loadImage(ref);
      if (img) images.set(mediaKey(ref), img);
      else missingImages++;
      onProgress?.(++done, refs.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, refs.length) }, worker));

  const fonts = await loadFonts();
  return { assets: { images, fonts }, missingImages };
}

/** Frees decoded bitmaps once an export is finished. */
export function releaseAssets(assets: RenderAssets) {
  for (const img of assets.images.values()) {
    if (typeof ImageBitmap !== "undefined" && img.source instanceof ImageBitmap) img.source.close();
  }
  assets.images.clear();
}
