"use client";

import { useEffect, useRef } from "react";
import type { Question, Theme } from "@/types/quiz";
import { fontFamily } from "@/lib/themes";
import { promptFontStack } from "@/lib/promptText";
import { createPromptDrawing } from "@/lib/promptRenderer";
import { loadImage } from "@/lib/videoExport/assets";
import { frameSource } from "@/lib/videoExport/animatedImage";
import type { LoadedImage } from "@/lib/videoExport/renderer";
import { loadCartoonFont, resolveTextStyle } from "@/lib/textStyle";

/** The same measured drawing is used by live preview, both play modes and video. */
export function PromptCanvas({ question, theme, elapsed, typed }: { question: Question; theme: Theme; elapsed: number; typed: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const clock = useRef({ elapsed, typed });
  const redraw = useRef<(() => void) | null>(null);
  const imageRef = question.promptStyle?.box?.backgroundStyle === "image" ? question.promptStyle.box.image : undefined;
  const prompt = question.prompt;
  const style = question.promptStyle;
  const lettering = resolveTextStyle(theme.promptTextStyle);
  // A picture fill for the letters (any styled preset), loaded like the frame picture.
  const fillRef = lettering?.image;
  const fillKey = fillRef ? (fillRef.kind === "stored" ? `s:${fillRef.id}` : `u:${fillRef.url}`) : "";

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let active = true;
    let picture: LoadedImage | null = null;
    let fillPicture: LoadedImage | null = null;
    const startedAt = performance.now();
    const abort = new AbortController();
    const release = (image: LoadedImage | null) => {
      if (!image) return;
      const sources = new Set([image.source, ...(image.frames ?? []).map((frame) => frame.source)]);
      for (const source of sources) if (typeof ImageBitmap !== "undefined" && source instanceof ImageBitmap) source.close();
    };
    let frame = 0;
    const css = getComputedStyle(canvas);
    const family = promptFontStack(fontFamily(style?.font ?? theme.font, style?.font ? style.customFont : theme.customFont, {
      sans: css.getPropertyValue("--font-geist-sans").trim() || "sans-serif",
      mono: css.getPropertyValue("--font-geist-mono").trim() || "monospace",
      display: css.getPropertyValue("--font-outfit").trim() || "sans-serif",
    }));
    let drawing = createPromptDrawing(ctx, { prompt, promptStyle: style }, theme, family);
    const draw = () => {
      if (!active) return;
      const width = Math.max(1, canvas.getBoundingClientRect().width);
      const height = width * drawing.height / drawing.width;
      const ratio = window.devicePixelRatio || 1;
      canvas.style.aspectRatio = `${drawing.width} / ${drawing.height}`;
      const pixelWidth = Math.ceil(width * ratio), pixelHeight = Math.ceil(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) { canvas.width = pixelWidth; canvas.height = pixelHeight; }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(canvas.width / drawing.width, canvas.width / drawing.width);
      drawing.draw(
        clock.current.elapsed,
        clock.current.typed,
        picture ? { ...picture, source: frameSource(picture, performance.now() - startedAt) } : undefined,
        fillPicture ? { ...fillPicture, source: frameSource(fillPicture, performance.now() - startedAt) } : undefined,
      );
    };
    redraw.current = draw;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    void Promise.all([
      document.fonts.load(`${style?.italic ? "italic " : ""}${style?.bold === false ? 400 : 700} 30px ${family}`),
      resolveTextStyle(theme.promptTextStyle) ? loadCartoonFont() : undefined,
    ]).then(() => {
      if (!active) return;
      drawing = createPromptDrawing(ctx, { prompt, promptStyle: style }, theme, family);
      draw();
    }).catch(() => { /* An unavailable custom font keeps its fallback. */ });
    if (imageRef) {
      void loadImage(imageRef, abort.signal).then((loaded) => {
        if (!active) { release(loaded); return; }
        picture = loaded;
        const animatePicture = () => {
          draw();
          if (active && (picture?.frames?.length ?? 0) > 1) frame = requestAnimationFrame(animatePicture);
        };
        animatePicture();
      });
    }
    const fillMedia = resolveTextStyle(theme.promptTextStyle)?.image;
    if (fillMedia) {
      void loadImage(fillMedia, abort.signal).then((loaded) => {
        if (!active) { release(loaded); return; }
        fillPicture = loaded;
        const animateFill = () => {
          draw();
          if (active && (fillPicture?.frames?.length ?? 0) > 1) frame = requestAnimationFrame(animateFill);
        };
        animateFill();
      });
    }
    return () => { active = false; abort.abort(); release(picture); release(fillPicture); cancelAnimationFrame(frame); observer.disconnect(); redraw.current = null; };
  }, [prompt, style, theme, imageRef, fillKey]);

  useEffect(() => {
    clock.current = { elapsed, typed };
    redraw.current?.();
  }, [elapsed, typed]);

  return <h2 className="stage-prompt w-full" aria-label={prompt || "Untitled question"}>
    <canvas ref={ref} aria-hidden="true" className="block h-auto w-full" />
  </h2>;
}
