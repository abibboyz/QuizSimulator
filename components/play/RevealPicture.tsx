"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Question, Theme } from "@/types/quiz";
import { useMediaUrl } from "@/hooks/useMediaUrl";
import { useElapsedSince } from "@/hooks/useElapsedSince";
import { captionPose, resolveReveal, revealAspect, revealFallbackColor, revealProgress } from "@/lib/reveal";
import { createRevealEnv, drawReveal, type RevealDrawEnv, type RevealSource } from "@/lib/revealDraw";
import { POP_IN } from "@/lib/playTiming";

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
}: Props) {
  const reveal = question.reveal;
  const settings = useMemo(() => resolveReveal({ reveal }), [reveal]);
  const image = useLoadedImage(useMediaUrl(question.media));
  const cover = useLoadedImage(useMediaUrl(settings.cover));
  const aspect = revealAspect(question.media, image);

  const elapsed = useElapsedSince(revealKey, settings.durationMs + POP_IN.durationMs, instant);
  const progress = revealProgress(elapsed, settings.durationMs);
  const caption = captionClass !== null && settings.caption ? settings.caption : null;
  const capPose = captionPose(elapsed, settings.durationMs);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const envRef = useRef<RevealDrawEnv | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Follow the box's laid-out size so the canvas stays sharp at any width or DPR.
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
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.round(size.w * dpr);
    const H = Math.round(size.h * dpr);
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
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawReveal(ctx, 0, 0, size.w, size.h, 16, settings, progress, image, cover, envRef.current);
  }, [size, settings, progress, image, cover, theme.accent]);

  const shown = progress >= 1;

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
          className="block h-full w-full rounded-2xl"
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
