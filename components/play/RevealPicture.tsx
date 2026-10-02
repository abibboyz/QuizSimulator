"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Question, RevealSettings, Theme } from "@/types/quiz";
import { useMediaUrl } from "@/hooks/useMediaUrl";
import { useElapsedSince } from "@/hooks/useElapsedSince";
import { captionPose, resolveReveal, revealAspect, revealFallbackColor, revealProgress } from "@/lib/reveal";
import { createRevealEnv, drawReveal, type RevealDrawEnv, type RevealFit, type RevealSource } from "@/lib/revealDraw";
import { POP_IN } from "@/lib/playTiming";
import { canvasBackingSize } from "@/lib/canvasSize";

interface Props {
  question: Pick<Question, "media" | "reveal">;
  theme: Pick<Theme, "accent">;
  /** Non-null starts the uncover; a new value replays it from the start. */
  revealKey: string | null;
  /** CSS length the picture box may not grow past (e.g. "22vh", "40px"). */
  maxHeight: string;
  /** Jump straight to the end state (reduced motion, static thumbnails). */
  instant?: boolean;
  /** Caption text size; the caption is left out entirely when null. */
  captionClass?: string | null;
  className?: string;
  /** Fill the parent box instead of sizing to the picture's own aspect. */
  fill?: boolean;
  /** Corner radius drawn on the canvas, in CSS px. Match the box it sits in. */
  radius?: number;
  /** How pictures sit in the box; answer tiles use REVEAL_TILE (contain on white). Pass a stable object. */
  fit?: RevealFit;
  /** Fires after the answer picture has finished uncovering. */
  onRevealComplete?: () => void;
}

/** How long a reveal waits for its pictures to decode before going ahead without them. */
const SOURCE_WAIT_MS = 1500;

function refKey(ref: Question["media"]): string {
  if (!ref) return "";
  return ref.kind === "stored" ? `s:${ref.id}` : `u:${ref.url}`;
}

/** Decodes a URL into something a canvas can draw, with its natural size. */
function useLoadedImage(url: string | null): RevealSource | null {
  const [loaded, setLoaded] = useState<{ url: string; image: RevealSource } | null>(null);

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      if (!cancelled) setLoaded({ url, image: { source: img, width: img.naturalWidth, height: img.naturalHeight } });
    };
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);

  return url && loaded?.url === url ? loaded.image : null;
}

/**
 * A Reveal question's picture: hidden behind its cover (or degraded, for the
 * picture-based animations) until `revealKey` is set, then uncovered.
 *
 * Every frame is `drawReveal(progress)` with progress a pure function of the
 * elapsed time — the same drawing code and the same function the video
 * exporter calls — so this can't drift from an exported video.
 */
export function RevealPicture({
  question,
  theme,
  revealKey,
  maxHeight,
  instant = false,
  captionClass = null,
  className = "",
  fill = false,
  radius = 16,
  fit,
  onRevealComplete,
}: Props) {
  const reveal = question.reveal;
  const settings = useMemo(() => resolveReveal({ reveal }), [reveal]);
  const image = useLoadedImage(useMediaUrl(question.media));
  const cover = useLoadedImage(useMediaUrl(settings.cover));
  const aspect = revealAspect(question.media, image);

  // Don't start (or draw) until both pictures are decoded. Starting straight
  // away drew the first frames of the uncover over a placeholder and the colour
  // fallback — a visible flash — while the exporter always has its pictures.
  // A picture that never arrives (deleted media) stops holding things up.
  const sourcesKey = `${refKey(question.media)}|${refKey(settings.cover)}`;
  const sourcesReady = (!question.media || !!image) && (!settings.cover || !!cover);
  const [gaveUpOn, setGaveUpOn] = useState<string | null>(null);
  useEffect(() => {
    if (sourcesReady) return;
    const id = window.setTimeout(() => setGaveUpOn(sourcesKey), SOURCE_WAIT_MS);
    return () => window.clearTimeout(id);
  }, [sourcesReady, sourcesKey]);
  const ready = sourcesReady || gaveUpOn === sourcesKey;

  const elapsed = useElapsedSince(ready ? revealKey : null, settings.durationMs + POP_IN.durationMs, instant);
  const progress = revealProgress(elapsed, settings.durationMs);
  const caption = captionClass !== null && settings.caption ? settings.caption : null;
  const capPose = captionPose(elapsed, settings.durationMs);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const envRef = useRef<RevealDrawEnv | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Follow the box's laid-out size so the canvas stays sharp at any width or DPR.
  // The canvas is absolutely positioned in both layouts, so its backing store
  // can't feed back into the size being observed (see lib/canvasSize.ts).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) => {
      const box = entry.contentRect;
      setSize((prev) =>
        prev && prev.w === box.width && prev.h === box.height ? prev : { w: box.width, h: box.height },
      );
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !size || size.w <= 0 || size.h <= 0) return;
    if (!ready) {
      // Transparent until the pictures are in: whatever sits under the canvas (the tile's cover) shows through.
      canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const { width: W, height: H } = canvasBackingSize(size.w, size.h, window.devicePixelRatio || 1);
    // Map CSS px onto the rounded backing store exactly, per axis.
    const sx = W / size.w;
    const sy = H / size.h;
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const font = getComputedStyle(canvas).getPropertyValue("--quiz-font").trim() || "sans-serif";
    const fallback = revealFallbackColor(theme.accent);
    if (!envRef.current) envRef.current = createRevealEnv(fallback, font);
    envRef.current.fallbackColor = fallback;
    envRef.current.fontFamily = font;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.setTransform(sx, 0, 0, sy, 0, 0);
    drawReveal(ctx, 0, 0, size.w, size.h, radius, settings, progress, image, cover, envRef.current, fit);
  }, [size, settings, progress, image, cover, theme.accent, radius, fit, ready]);

  const shown = progress >= 1;
  const completedKey = useRef<string | null>(null);
  const completionRef = useRef(onRevealComplete);
  useEffect(() => {
    completionRef.current = onRevealComplete;
  }, [onRevealComplete]);
  useEffect(() => {
    if (!ready || !shown || revealKey === null || completedKey.current === revealKey) return;
    completedKey.current = revealKey;
    completionRef.current?.();
  }, [ready, shown, revealKey]);

  if (fill) {
    return (
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={shown ? question.media?.alt || "The answer picture" : "A hidden picture"}
        className={`absolute inset-0 h-full w-full ${className}`}
      />
    );
  }

  return (
    <div className={`flex flex-col items-center ${className}`}>
      <div
        className="relative"
        style={{ width: `min(100%, calc(${maxHeight} * ${aspect.toFixed(4)}))`, aspectRatio: aspect.toFixed(4) }}
      >
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={shown ? question.media?.alt || "The answer picture" : "A hidden picture"}
          className="absolute inset-0 block h-full w-full rounded-2xl"
        />
      </div>
      {caption && (
        // Space is held from the start so nothing jumps when it lands.
        <p
          className={`stage-prompt mt-2 text-center font-bold ${captionClass}`}
          style={{
            color: "var(--prompt-color)",
            visibility: capPose.opacity > 0 ? "visible" : "hidden",
            opacity: capPose.opacity,
            transform: capPose.opacity < 1 ? `translateY(${capPose.y}px) scale(${capPose.scale})` : undefined,
          }}
        >
          {caption}
        </p>
      )}
    </div>
  );
}

interface CaptionProps {
  settings: Pick<RevealSettings, "caption" | "durationMs">;
  /** Non-null once the answer is out; the caption pops in after the uncover finishes. */
  revealKey: string | null;
  instant?: boolean;
  className?: string;
}

/**
 * A Reveal question's caption under the answer grid. Its space is held from
 * the start (nothing jumps when it lands), and it pops in with `captionPose`
 * once the uncover finishes — the same function and moment the exporter uses.
 */
export function RevealCaption({ settings, revealKey, instant = false, className = "" }: CaptionProps) {
  const elapsed = useElapsedSince(revealKey, settings.durationMs + POP_IN.durationMs, instant);
  if (!settings.caption) return null;
  const pose = captionPose(elapsed, settings.durationMs);
  return (
    <p
      className={className}
      style={{
        color: "var(--prompt-color, #e9ebf4)",
        visibility: pose.opacity > 0 ? "visible" : "hidden",
        opacity: pose.opacity,
        transform: pose.opacity < 1 ? `translateY(${pose.y}px) scale(${pose.scale})` : undefined,
      }}
    >
      {settings.caption}
    </p>
  );
}
