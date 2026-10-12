"use client";

import { useEffect, useMemo, useRef } from "react";
import type { Question, Theme } from "@/types/quiz";
import { fontFamily } from "@/lib/themes";
import { promptFontStack } from "@/lib/promptText";
import { createPromptDrawing, joinerDesignWidth } from "@/lib/promptRenderer";
import { loadImage } from "@/lib/videoExport/assets";
import { frameSource } from "@/lib/videoExport/animatedImage";
import type { LoadedImage } from "@/lib/videoExport/renderer";
import { loadCartoonFont, resolveTextStyle } from "@/lib/textStyle";

/** A between-image word painted with the same drawing as a designed prompt, sized to the word. */
export function JoinerCanvas({
  text,
  style,
  theme,
  cssWidth,
  elapsed = Infinity,
}: {
  text: string;
  style: NonNullable<Question["promptStyle"]>;
  theme: Theme;
  cssWidth: string;
  elapsed?: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const clock = useRef(elapsed);
  const redraw = useRef<(() => void) | null>(null);
  const imageRef = style.box?.backgroundStyle === "image" && style.box.hideBackground !== true ? style.box.image : undefined;
  // Keep the resolved object stable while only the animation clock changes.
  // Otherwise adding it to the drawing effect's dependencies would rebuild
  // the canvas (and restart animated fills) on every elapsed-time render.
  const lettering = useMemo(() => resolveTextStyle(theme.promptTextStyle), [theme.promptTextStyle]);
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
    const family = promptFontStack(fontFamily(style.font ?? theme.font, style.font ? style.customFont : theme.customFont, {
      sans: css.getPropertyValue("--font-geist-sans").trim() || "sans-serif",
      mono: css.getPropertyValue("--font-geist-mono").trim() || "monospace",
      display: css.getPropertyValue("--font-outfit").trim() || "sans-serif",
    }));
    const designWidth = joinerDesignWidth(text, style);
    let drawing = createPromptDrawing(ctx, { prompt: text, promptStyle: style }, theme, family, { designWidth });
    const draw = () => {
      if (!active) return;
      const width = Math.max(1, canvas.getBoundingClientRect().width);
      const height = width * drawing.height / drawing.width;
      const ratio = window.devicePixelRatio || 1;
      canvas.style.aspectRatio = `${drawing.width} / ${drawing.height}`;
      const pixelWidth = Math.ceil(width * ratio);
      const pixelHeight = Math.ceil(height * ratio);
      if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.scale(canvas.width / drawing.width, canvas.width / drawing.width);
      drawing.draw(
        clock.current,
        Infinity,
        picture ? { ...picture, source: frameSource(picture, performance.now() - startedAt) } : undefined,
        fillPicture ? { ...fillPicture, source: frameSource(fillPicture, performance.now() - startedAt) } : undefined,
      );
    };
    redraw.current = draw;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    draw();
    void Promise.all([
      document.fonts.load(`${style.italic ? "italic " : ""}${style.bold === false ? 400 : 700} 30px ${family}`),
      lettering ? loadCartoonFont() : undefined,
    ]).then(() => {
      if (!active) return;
      drawing = createPromptDrawing(ctx, { prompt: text, promptStyle: style }, theme, family, { designWidth });
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
      }).catch(() => { /* A missing picture keeps the fill colour. */ });
    }
    if (fillRef) {
      void loadImage(fillRef, abort.signal).then((loaded) => {
        if (!active) { release(loaded); return; }
        fillPicture = loaded;
        const animateFill = () => {
          draw();
          if (active && (fillPicture?.frames?.length ?? 0) > 1) frame = requestAnimationFrame(animateFill);
        };
        animateFill();
      }).catch(() => { /* Letter fill is optional. */ });
    }
    return () => {
      active = false;
      abort.abort();
      release(picture);
      release(fillPicture);
      cancelAnimationFrame(frame);
      observer.disconnect();
      redraw.current = null;
    };
  }, [text, style, theme, imageRef, lettering, fillRef, fillKey]);

  useEffect(() => {
    clock.current = elapsed;
    redraw.current?.();
  }, [elapsed]);

  return <canvas ref={ref} aria-hidden="true" className="block h-auto max-w-full" style={{ width: cssWidth }} />;
}
