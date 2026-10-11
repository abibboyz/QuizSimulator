/**
 * Everything the frame renderer needs loaded before frame 0: decoded pictures
 * and the app's web fonts. Loading up front keeps rendering synchronous and
 * deterministic — no frame is ever drawn with a half-loaded image.
 */

import { exportWait } from "@/lib/videoExport/wait";
import { decodeAnimatedBlob } from "@/lib/videoExport/animatedImage";
import type { MediaRef, Quiz } from "@/types/quiz";
import { getMedia } from "@/lib/storage";
import { imageRefs, mediaKey } from "@/lib/mediaRefs";
import { loadCartoonFont, usesTextStyle } from "@/lib/textStyle";
import type { FontSet, LoadedImage, RenderAssets } from "@/lib/videoExport/renderer";

async function decodePicture(blob: Blob): Promise<LoadedImage> {
  const animated = await decodeAnimatedBlob(blob);
  if (animated) return animated;
  return decodeBlob(blob);
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
    const timer = setTimeout(() => { img.src = ""; reject(new Error("Picture loading timed out")); }, 20_000);
    img.onload = () => { clearTimeout(timer); resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight }); };
    img.onerror = () => { clearTimeout(timer); reject(new Error("Could not load picture")); };
    img.src = url;
  });
}

export async function loadImage(ref: MediaRef, signal?: AbortSignal): Promise<LoadedImage | null> {
  try {
    if (ref.kind === "stored") {
      const record = await getMedia(ref.id);
      return record ? await decodePicture(record.blob) : null;
    }
    // Web images must allow CORS: drawing one that doesn't would taint the
    // canvas and make every frame unreadable to the encoder.
    try {
      const response = await fetch(ref.url, { mode: "cors", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000) });
      if (response.ok) return await decodePicture(await response.blob());
    } catch {
      // try the <img crossorigin> route below
    }
    signal?.throwIfAborted();
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
      const img = await loadImage(ref, signal);
      if (signal?.aborted) {
        if (img && typeof ImageBitmap !== "undefined" && img.source instanceof ImageBitmap) img.source.close();
        signal.throwIfAborted();
      }
      if (img) images.set(mediaKey(ref), img);
      else missingImages++;
      onProgress?.(++done, refs.length);
    }
  };
  try {
    const results = await Promise.allSettled(Array.from({ length: Math.min(6, refs.length) }, worker));
    const failure = results.find((result) => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    // Styled lettering draws with the bundled cartoon face; wait for it before the first frame.
    const fonts = await exportWait(
      Promise.all([loadFonts(), usesTextStyle(quiz.theme) ? loadCartoonFont() : undefined]).then(([set]) => set),
      signal,
      "Font loading",
    );
    return { assets: { images, fonts }, missingImages };
  } catch (error) {
    releaseAssets({ images, fonts: { sans: "", mono: "", display: "" } });
    throw error;
  }
}

/** Frees decoded bitmaps once an export is finished. */
export function releaseAssets(assets: RenderAssets) {
  for (const img of assets.images.values()) {
    const seen = new Set<ImageBitmap>();
    const close = (source: CanvasImageSource) => {
      if (typeof ImageBitmap === "undefined" || !(source instanceof ImageBitmap) || seen.has(source)) return;
      seen.add(source);
      source.close();
    };
    close(img.source);
    for (const frame of img.frames ?? []) close(frame.source);
  }
  assets.images.clear();
}
