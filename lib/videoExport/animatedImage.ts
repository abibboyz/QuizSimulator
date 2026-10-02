/**
 * Animated pictures for the video exporter. A GIF drawn through one bitmap is
 * a single frozen frame, so an animated file is decoded into its frames and
 * the renderer picks the frame for the timestamp it is drawing. That keeps an
 * export identical on a fast or slow machine, matching the on-screen image.
 */

export interface AnimatedFrame {
  source: ImageBitmap;
  /** How long this frame stays up. A GIF delay of 0 is stored as 100ms. */
  durationUs: number;
}

/** Index of the frame showing at `tMs`, looping the way an `<img>` loops a GIF. */
export function frameIndexAt(frames: { durationUs: number }[], tMs: number): number {
  if (frames.length === 0) return 0;
  const spans = frames.map((frame) => (frame.durationUs > 0 ? frame.durationUs : 100_000));
  const total = spans.reduce((sum, span) => sum + span, 0);
  if (total <= 0) return 0;
  let us = ((tMs * 1000) % total + total) % total;
  for (let i = 0; i < spans.length; i++) {
    if (us < spans[i]) return i;
    us -= spans[i];
  }
  return spans.length - 1;
}

interface TimedPicture {
  source: CanvasImageSource;
  frames?: { source: CanvasImageSource; durationUs: number }[];
}

/** The pixels to draw for this picture at `tMs`. A still picture ignores the time. */
export function frameSource(img: TimedPicture, tMs: number): CanvasImageSource {
  if (!img.frames || img.frames.length < 2) return img.source;
  return img.frames[frameIndexAt(img.frames, tMs)].source;
}

const ANIMATED_TYPES = new Set(["image/gif", "image/apng", "image/webp"]);

interface DecoderFrame {
  displayWidth: number;
  displayHeight: number;
  duration: number | null;
  close: () => void;
}

interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  decode: (options: { frameIndex: number }) => Promise<{ image: DecoderFrame }>;
  close: () => void;
}

type ImageDecoderCtor = new (init: { data: BufferSource; type: string }) => ImageDecoderLike;

function imageDecoder(): ImageDecoderCtor | null {
  const ctor = (globalThis as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;
  return typeof ctor === "function" ? ctor : null;
}

/**
 * Decodes an animated picture into full frames. Returns null for a still
 * picture, or when this browser can't decode the animation — the caller then
 * keeps the single-frame path so the export still finishes.
 */
export async function decodeAnimatedBlob(blob: Blob): Promise<{
  source: ImageBitmap;
  width: number;
  height: number;
  frames: AnimatedFrame[];
} | null> {
  if (!ANIMATED_TYPES.has(blob.type) || typeof createImageBitmap !== "function") return null;
  const Decoder = imageDecoder();
  if (!Decoder) return null;

  const frames: AnimatedFrame[] = [];
  let decoder: ImageDecoderLike | null = null;
  try {
    decoder = new Decoder({ data: await blob.arrayBuffer(), type: blob.type });
    await decoder.tracks.ready;
    const count = decoder.tracks.selectedTrack?.frameCount ?? 0;
    if (count < 2) return null;

    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i });
      try {
        const bitmap = await createImageBitmap(image as unknown as ImageBitmapSource);
        const durationUs = image.duration && image.duration > 0 ? image.duration : 100_000;
        frames.push({ source: bitmap, durationUs });
      } finally {
        image.close();
      }
    }
  } catch {
    for (const frame of frames) frame.source.close();
    return null;
  } finally {
    decoder?.close();
  }

  const first = frames[0];
  if (!first) return null;
  return {
    source: first.source,
    width: first.source.width || 1,
    height: first.source.height || 1,
    frames,
  };
}
