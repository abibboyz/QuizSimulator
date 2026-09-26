/**
 * Draws a Reveal question's picture at a given reveal progress onto any 2D
 * canvas. Used by the live stage (`RevealPicture`, driven by a clock) and by
 * the video exporter (driven by `t = frame / fps`), so both draw the very same
 * frame for the same progress.
 *
 * No React, no timing: the caller passes `p` from `revealProgress()`.
 */

import type { RevealSettings } from "@/types/quiz";
import {
  blurRadius,
  cardFlipAngle,
  coverTravel,
  flipFace,
  irisRadius,
  pixelBlocks,
  shatterPiece,
  tileFlipProgress,
  tileGrid,
  zoomWindow,
} from "@/lib/reveal";
import { REVEAL_ANIMATIONS } from "@/lib/reveal";

export interface RevealSource {
  source: CanvasImageSource;
  width: number;
  height: number;
}

type Scratch = HTMLCanvasElement;

export interface RevealDrawEnv {
  /** Whether `ctx.filter = "blur()"` works here (not in older Safari). */
  filterBlur: boolean;
  /** Fill for the "color" cover fallback. */
  fallbackColor: string;
  /** Family for the "?" on the colour fallback. */
  fontFamily: string;
  /** Reused scratch canvases, keyed by purpose. Keep one env per drawing surface. */
  scratch: Map<string, Scratch>;
}

export function createRevealEnv(fallbackColor: string, fontFamily: string, filterBlur?: boolean): RevealDrawEnv {
  return {
    filterBlur: filterBlur ?? canvasFilterSupported(),
    fallbackColor,
    fontFamily,
    scratch: new Map(),
  };
}

export function canvasFilterSupported(): boolean {
  if (typeof document === "undefined") return false;
  const ctx = document.createElement("canvas").getContext("2d");
  if (!ctx || !("filter" in ctx)) return false;
  ctx.filter = "blur(1px)";
  return ctx.filter === "blur(1px)";
}

const BACKDROP = "#0a0c16";

function scratch(
  env: RevealDrawEnv,
  key: string,
  w: number,
  h: number,
): { canvas: Scratch; ctx: CanvasRenderingContext2D } {
  let canvas = env.scratch.get(key);
  if (!canvas) {
    canvas = document.createElement("canvas");
    env.scratch.set(key, canvas);
  }
  const W = Math.max(1, Math.round(w));
  const H = Math.max(1, Math.round(h));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  const ctx = canvas.getContext("2d")!;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.clearRect(0, 0, W, H);
  return { canvas, ctx };
}

/** `object-fit: cover` into (0,0,w,h). */
function drawCoverFit(ctx: CanvasRenderingContext2D, img: RevealSource, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img.source, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Blurs `src` into `ctx` (0,0,w,h) by `radius` device px, filter or downscale fallback. */
function blurInto(
  env: RevealDrawEnv,
  ctx: CanvasRenderingContext2D,
  src: Scratch,
  w: number,
  h: number,
  radius: number,
) {
  if (radius < 0.5) {
    ctx.drawImage(src, 0, 0, w, h);
    return;
  }
  if (env.filterBlur) {
    // Drawn slightly oversized so the blur doesn't pull transparent edges in.
    const pad = radius * 2;
    ctx.save();
    ctx.filter = `blur(${radius.toFixed(2)}px)`;
    ctx.drawImage(src, -pad, -pad, w + pad * 2, h + pad * 2);
    ctx.restore();
    return;
  }
  // Downscale then smooth upscale: close enough to a gaussian at these radii.
  const factor = Math.max(1, radius / 2);
  const small = scratch(env, "blur-small", w / factor, h / factor);
  small.ctx.drawImage(src, 0, 0, small.canvas.width, small.canvas.height);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(small.canvas, 0, 0, w, h);
  ctx.restore();
}

function imageLayer(env: RevealDrawEnv, image: RevealSource | null, W: number, H: number): Scratch {
  const { canvas, ctx } = scratch(env, "image", W, H);
  if (image) drawCoverFit(ctx, image, W, H);
  else {
    ctx.fillStyle = "#1d2136";
    ctx.fillRect(0, 0, W, H);
  }
  return canvas;
}

function coverLayer(
  env: RevealDrawEnv,
  settings: RevealSettings,
  cover: RevealSource | null,
  image: Scratch,
  W: number,
  H: number,
): Scratch {
  const { canvas, ctx } = scratch(env, "cover", W, H);
  if (cover) {
    drawCoverFit(ctx, cover, W, H);
    return canvas;
  }
  if (settings.coverFallback === "blur") {
    blurInto(env, ctx, image, W, H, Math.max(12, Math.min(W, H) * 0.12));
    ctx.fillStyle = "rgba(5, 6, 12, 0.35)";
    ctx.fillRect(0, 0, W, H);
    return canvas;
  }
  const color = settings.coverColor ?? env.fallbackColor;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.3, H * 0.25, 0, W * 0.3, H * 0.25, Math.max(W, H) * 0.9);
  glow.addColorStop(0, "rgba(255,255,255,0.22)");
  glow.addColorStop(1, "rgba(0,0,0,0.25)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  const size = Math.min(W, H) * 0.5;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.font = `800 ${size.toFixed(1)}px ${env.fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("?", W / 2, H / 2 + size * 0.04);
  return canvas;
}

/** The picture-based animations' hidden look, or their in-between frames. */
function drawPictureBased(
  env: RevealDrawEnv,
  ctx: CanvasRenderingContext2D,
  settings: RevealSettings,
  p: number,
  image: Scratch,
  source: RevealSource | null,
  W: number,
  H: number,
  cssW: number,
  cssH: number,
) {
  if (settings.animation === "pixelate") {
    const blocks = pixelBlocks(p, settings.tiles, cssW);
    if (!blocks) {
      ctx.drawImage(image, 0, 0, W, H);
      return;
    }
    const rows = Math.max(1, Math.round((blocks * cssH) / cssW));
    const small = scratch(env, "pixel", blocks, rows);
    small.ctx.drawImage(image, 0, 0, blocks, rows);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small.canvas, 0, 0, W, H);
    ctx.restore();
    return;
  }
  if (settings.animation === "blur") {
    blurInto(env, ctx, image, W, H, blurRadius(p, cssW, cssH) * (W / cssW));
    return;
  }
  // zoom: crop from the original picture for full sharpness while cropped in.
  const win = zoomWindow(p, settings.zoom, settings.focusX, settings.focusY);
  if (source) {
    // Map the window through the same cover-fit the image layer uses.
    const scale = Math.max(W / source.width, H / source.height);
    const offX = (source.width * scale - W) / 2;
    const offY = (source.height * scale - H) / 2;
    const sx = (win.x * W + offX) / scale;
    const sy = (win.y * H + offY) / scale;
    ctx.drawImage(source.source, sx, sy, (win.w * W) / scale, (win.h * H) / scale, 0, 0, W, H);
  } else {
    ctx.drawImage(image, win.x * W, win.y * H, win.w * W, win.h * H, 0, 0, W, H);
  }
}

/**
 * Draws the picture box at (x, y, w, h) in the context's current coordinate
 * space, rounded to `radius`, at reveal progress `p` (0 hidden → 1 uncovered).
 */
export function drawReveal(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
  settings: RevealSettings,
  p: number,
  image: RevealSource | null,
  cover: RevealSource | null,
  env: RevealDrawEnv,
) {
  if (w <= 0 || h <= 0) return;
  // Work at device resolution: the layers are sized to what the box covers on screen.
  const m = ctx.getTransform();
  const k = Math.max(0.01, Math.hypot(m.a, m.b));
  const W = Math.max(1, Math.round(w * k));
  const H = Math.max(1, Math.round(h * k));

  const img = imageLayer(env, image, W, H);
  const info = REVEAL_ANIMATIONS[settings.animation];

  const out = scratch(env, "out", W, H);
  const o = out.ctx;
  o.fillStyle = BACKDROP;
  o.fillRect(0, 0, W, H);

  if (p >= 1) {
    o.drawImage(img, 0, 0);
  } else if (!info.usesCover) {
    drawPictureBased(env, o, settings, p, img, image, W, H, w, h);
  } else {
    const cov = coverLayer(env, settings, cover, img, W, H);
    if (p <= 0) o.drawImage(cov, 0, 0);
    else drawCoverBased(o, settings, p, img, cov, W, H);
  }

  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(out.canvas, x, y, w, h);
  ctx.restore();
}

function drawCoverBased(
  o: CanvasRenderingContext2D,
  settings: RevealSettings,
  p: number,
  img: Scratch,
  cov: Scratch,
  W: number,
  H: number,
) {
  const edge = (x1: number, y1: number, x2: number, y2: number) => {
    o.save();
    o.strokeStyle = "rgba(255,255,255,0.75)";
    o.lineWidth = Math.max(1.5, Math.min(W, H) * 0.008);
    o.beginPath();
    o.moveTo(x1, y1);
    o.lineTo(x2, y2);
    o.stroke();
    o.restore();
  };

  switch (settings.animation) {
    case "tiles":
    case "shatter": {
      const { cols, rows } = tileGrid(settings.tiles, W / H);
      const tw = W / cols;
      const th = H / rows;
      if (settings.animation === "shatter") o.drawImage(img, 0, 0);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const sx = c * tw;
          const sy = r * th;
          if (settings.animation === "tiles") {
            const { scaleX, face } = flipFace(tileFlipProgress(p, c, r, cols, rows));
            if (scaleX < 0.001) continue;
            o.save();
            o.translate(sx + tw / 2, sy + th / 2);
            o.scale(scaleX, 1);
            // Darken toward edge-on, like light falling off a turning card.
            o.drawImage(face === "cover" ? cov : img, sx, sy, tw, th, -tw / 2, -th / 2, tw, th);
            if (scaleX < 0.98) {
              o.fillStyle = `rgba(0,0,0,${(0.45 * (1 - scaleX)).toFixed(3)})`;
              o.fillRect(-tw / 2, -th / 2, tw, th);
            }
            o.restore();
          } else {
            const piece = shatterPiece(p, c, r, cols, rows, settings.focusX, settings.focusY);
            if (piece.opacity <= 0) continue;
            o.save();
            o.globalAlpha = piece.opacity;
            o.translate(sx + tw / 2 + piece.dx * W, sy + th / 2 + piece.dy * H);
            o.rotate((piece.rotate * Math.PI) / 180);
            o.scale(piece.scale, piece.scale);
            o.drawImage(cov, sx, sy, tw, th, -tw / 2, -th / 2, tw, th);
            o.restore();
          }
        }
      }
      return;
    }
    case "curtain": {
      const f = coverTravel(p);
      o.drawImage(img, 0, 0);
      const half = W / 2;
      const shift = half * f;
      o.drawImage(cov, 0, 0, half, H, -shift, 0, half, H);
      o.drawImage(cov, half, 0, W - half, H, half + shift, 0, W - half, H);
      // Soft shadow on the inner edges sells the depth.
      for (const [edgeX, dir] of [
        [half - shift, -1],
        [half + shift, 1],
      ] as const) {
        const g = o.createLinearGradient(edgeX, 0, edgeX - dir * W * 0.04, 0);
        g.addColorStop(0, "rgba(0,0,0,0.35)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        o.fillStyle = g;
        o.fillRect(Math.min(edgeX, edgeX - dir * W * 0.04), 0, W * 0.04, H);
      }
      return;
    }
    case "wipe-left":
    case "wipe-right":
    case "wipe-up":
    case "wipe-down": {
      const f = coverTravel(p);
      o.drawImage(img, 0, 0);
      o.save();
      o.beginPath();
      if (settings.animation === "wipe-left") o.rect(0, 0, W * (1 - f), H);
      else if (settings.animation === "wipe-right") o.rect(W * f, 0, W * (1 - f), H);
      else if (settings.animation === "wipe-up") o.rect(0, 0, W, H * (1 - f));
      else o.rect(0, H * f, W, H * (1 - f));
      o.clip();
      o.drawImage(cov, 0, 0);
      o.restore();
      if (settings.animation === "wipe-left") edge(W * (1 - f), 0, W * (1 - f), H);
      else if (settings.animation === "wipe-right") edge(W * f, 0, W * f, H);
      else if (settings.animation === "wipe-up") edge(0, H * (1 - f), W, H * (1 - f));
      else edge(0, H * f, W, H * f);
      return;
    }
    case "iris": {
      const fx = settings.focusX * W;
      const fy = settings.focusY * H;
      const far = Math.max(
        Math.hypot(fx, fy),
        Math.hypot(W - fx, fy),
        Math.hypot(fx, H - fy),
        Math.hypot(W - fx, H - fy),
      );
      const radius = far * irisRadius(p);
      o.drawImage(cov, 0, 0);
      o.save();
      o.beginPath();
      o.arc(fx, fy, radius, 0, Math.PI * 2);
      o.clip();
      o.drawImage(img, 0, 0);
      o.restore();
      if (radius > 1) {
        o.save();
        o.strokeStyle = "rgba(255,255,255,0.8)";
        o.lineWidth = Math.max(1.5, Math.min(W, H) * 0.01);
        o.beginPath();
        o.arc(fx, fy, radius, 0, Math.PI * 2);
        o.stroke();
        o.restore();
      }
      return;
    }
    case "fade": {
      o.drawImage(img, 0, 0);
      o.save();
      o.globalAlpha = 1 - coverTravel(p);
      o.drawImage(cov, 0, 0);
      o.restore();
      return;
    }
    case "flip": {
      const angle = cardFlipAngle(p);
      const scaleX = Math.abs(Math.cos((angle * Math.PI) / 180));
      const face = angle < 90 ? cov : img;
      o.save();
      o.translate(W / 2, H / 2);
      o.scale(Math.max(0.001, scaleX), 1);
      o.drawImage(face, -W / 2, -H / 2);
      if (scaleX < 0.98) {
        o.fillStyle = `rgba(0,0,0,${(0.4 * (1 - scaleX)).toFixed(3)})`;
        o.fillRect(-W / 2, -H / 2, W, H);
      }
      o.restore();
      return;
    }
    default:
      o.drawImage(img, 0, 0);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
