"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { tintLettering } from "@/lib/answerChrome";
import { frameSource } from "@/lib/videoExport/animatedImage";
import { loadImage } from "@/lib/videoExport/assets";
import type { LoadedImage } from "@/lib/videoExport/renderer";
import { mediaKey } from "@/lib/mediaRefs";
import {
  cartoonFont,
  loadCartoonFont,
  paintStyledLines,
  styledWrapWidth,
  wrapWords,
  type ResolvedTextStyle,
} from "@/lib/textStyle";

interface Props {
  text: string;
  style: ResolvedTextStyle;
  align?: "left" | "center";
  /** Candy cycles colours from here (the tile index). */
  colorIndex?: number;
  className?: string;
  /** CSS font size when the box shouldn't inherit it (image captions). */
  fontSize?: string;
  /** Per-answer colour used as the lettering accent (box-less tiles and captions). */
  tint?: string;
}

interface Layout {
  width: number;
  px: number;
  lines: string[];
  ascent: number;
  descent: number;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function measurer(): CanvasRenderingContext2D | null {
  if (!measureCtx && typeof document !== "undefined") measureCtx = document.createElement("canvas").getContext("2d");
  return measureCtx;
}

/**
 * Styled (non-Plain) answer text and captions in the DOM. Wraps with the same
 * rule and paints with the same painter as the video renderer (lib/textStyle),
 * at the size CSS gives this box, in 1.5 line-height line boxes — so a tile
 * here and a tile in the export carry identical lettering. The real text stays
 * in the DOM (screen-reader only); the canvas is decoration.
 */
export function StyledText({ text, style: baseStyle, align = "left", colorIndex = 0, className = "", fontSize, tint }: Props) {
  const style = useMemo(() => tintLettering(baseStyle, tint), [baseStyle, tint]);
  const boxRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [fontReady, setFontReady] = useState(0);
  const [picture, setPicture] = useState<LoadedImage | null>(null);
  const imageKey = style.image ? mediaKey(style.image) : "";
  const imageRef = useRef(style.image);
  useEffect(() => {
    imageRef.current = style.image;
  });

  useEffect(() => {
    let live = true;
    void loadCartoonFont().then(() => live && setFontReady((n) => n + 1));
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    const media = imageRef.current;
    if (!media) return;
    const abort = new AbortController();
    let loaded: LoadedImage | null = null;
    void loadImage(media, abort.signal).then((img) => {
      loaded = img;
      if (!abort.signal.aborted) setPicture(img);
    });
    return () => {
      abort.abort();
      setPicture(null);
      const done = loaded;
      if (done && typeof ImageBitmap !== "undefined") {
        for (const source of new Set([done.source, ...(done.frames ?? []).map((f) => f.source)])) {
          if (source instanceof ImageBitmap) source.close();
        }
      }
    };
  }, [imageKey]);

  // Measure: layout width (unaffected by tile animations' transforms) and the CSS font size.
  useEffect(() => {
    const box = boxRef.current;
    const ctx = measurer();
    if (!box || !ctx) return;
    const relayout = (width: number) => {
      const px = parseFloat(getComputedStyle(box).fontSize) || 16;
      ctx.font = cartoonFont(px);
      ctx.letterSpacing = "0px";
      const lines = wrapWords(text, (sample) => ctx.measureText(sample).width, styledWrapWidth(width, px, style));
      const m = ctx.measureText("Hg");
      const ascent = Number.isFinite(m.fontBoundingBoxAscent) ? m.fontBoundingBoxAscent : px * 0.8;
      const descent = Number.isFinite(m.fontBoundingBoxDescent) ? m.fontBoundingBoxDescent : px * 0.2;
      setLayout((prev) =>
        prev && prev.width === width && prev.px === px && prev.ascent === ascent && prev.lines.join("\n") === lines.join("\n")
          ? prev
          : { width, px, lines, ascent, descent },
      );
    };
    const observer = new ResizeObserver(([entry]) => relayout(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, [text, style, fontReady]);

  // Paint.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !layout) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const lh = layout.px * 1.5;
    const height = layout.lines.length * lh;
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    let frame = 0;
    const started = performance.now();
    const paint = () => {
      const w = Math.max(1, Math.ceil(layout.width * dpr));
      const h = Math.max(1, Math.ceil(height * dpr));
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== h) canvas.height = h;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, layout.width, height);
      ctx.font = cartoonFont(layout.px);
      ctx.letterSpacing = "0px";
      const pic = picture ? { ...picture, source: frameSource(picture, performance.now() - started) } : null;
      paintStyledLines(
        ctx,
        layout.lines,
        { x: 0, width: layout.width, top: 0, lineHeight: lh, px: layout.px, align, ascent: layout.ascent, descent: layout.descent },
        style,
        colorIndex,
        pic,
      );
      if ((picture?.frames?.length ?? 0) > 1) frame = requestAnimationFrame(paint);
    };
    paint();
    return () => cancelAnimationFrame(frame);
  }, [layout, style, align, colorIndex, picture]);

  const lh = layout ? layout.px * 1.5 : undefined;
  return (
    <span
      ref={boxRef}
      className={`relative block min-w-0 ${className}`}
      style={layout ? { height: layout.lines.length * (lh ?? 0), lineHeight: 1.5, fontSize } : { lineHeight: 1.5, fontSize }}
      data-text-style={style.preset}
    >
      <span className="sr-only">{text}</span>
      {layout ? (
        <canvas ref={canvasRef} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
      ) : (
        <span aria-hidden="true" className="invisible break-words">
          {text}
        </span>
      )}
    </span>
  );
}
