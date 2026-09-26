/**
 * Reveal questions: the answer picture sits under a cover (or is itself
 * pixelated / blurred / cropped in) while the question runs, and is uncovered
 * when the answer is shown.
 *
 * Everything here is a pure function of reveal progress `p` (0 = hidden,
 * 1 = fully uncovered), which is itself a pure function of time since the
 * reveal. `lib/revealDraw.ts` turns these numbers into canvas drawing for both
 * the live stage and the video exporter.
 *
 * Runtime imports are relative with extensions so `node --test` can load this.
 */

import type { CueSound, MediaRef, Question, RevealAnimation, RevealSettings } from "@/types/quiz";
import { POP_IN, REVEAL_TIMING } from "./playTiming.ts";
import { clamp01, cubicBezier, lerp, mixColor, mulberry32 } from "./videoExport/motion.ts";

export const REVEAL_DEFAULTS: RevealSettings = {
  animation: "tiles",
  durationMs: REVEAL_TIMING.defaultMs,
  coverFallback: "color",
  tiles: 6,
  zoom: 4,
  focusX: 0.5,
  focusY: 0.5,
  sound: "reveal",
};

export interface RevealAnimationInfo {
  label: string;
  /** Draws the cover (or its fallback) on top. False: hides the picture itself. */
  usesCover: boolean;
  /** Label for the `tiles` number, when the animation reads it. */
  tilesLabel?: string;
  /** Reads `zoom`. */
  usesZoom?: boolean;
  /** Reads `focusX` / `focusY`. */
  usesFocus?: boolean;
}

export const REVEAL_ANIMATIONS: Record<RevealAnimation, RevealAnimationInfo> = {
  tiles: { label: "Tile flip", usesCover: true, tilesLabel: "Tiles across" },
  pixelate: { label: "Pixelate → sharp", usesCover: false, tilesLabel: "Blocks across at start" },
  blur: { label: "Blur → sharp", usesCover: false },
  zoom: { label: "Zoom out from a crop", usesCover: false, usesZoom: true, usesFocus: true },
  curtain: { label: "Curtain (split open)", usesCover: true },
  "wipe-left": { label: "Wipe ← left", usesCover: true },
  "wipe-right": { label: "Wipe → right", usesCover: true },
  "wipe-up": { label: "Wipe ↑ up", usesCover: true },
  "wipe-down": { label: "Wipe ↓ down", usesCover: true },
  iris: { label: "Iris / spotlight", usesCover: true, usesFocus: true },
  shatter: { label: "Shatter", usesCover: true, tilesLabel: "Pieces across" },
  fade: { label: "Cross-fade", usesCover: true },
  flip: { label: "Card flip", usesCover: true },
};

export const REVEAL_ANIMATION_IDS = Object.keys(REVEAL_ANIMATIONS) as RevealAnimation[];

/* --------------------------------------------------------------- resolution */

function num(value: unknown, fallback: number, min: number, max: number, round = false): number {
  const n = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return round ? Math.round(clamped) : clamped;
}

function isMediaRef(value: unknown): value is MediaRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as { kind?: unknown; id?: unknown; url?: unknown };
  return (ref.kind === "stored" && typeof ref.id === "string") || (ref.kind === "url" && typeof ref.url === "string");
}

/** Built-in sounds only: a reveal has nowhere to keep an uploaded file. Typed so a new CueSound can't be missed. */
const BUILT_IN_SOUNDS: Record<Exclude<CueSound, "custom">, true> = {
  start: true,
  correct: true,
  wrong: true,
  whoosh: true,
  riser: true,
  buzz: true,
  fanfare: true,
  consolation: true,
  reveal: true,
};

/**
 * Fills a stored partial with defaults and clamps it, so a missing, half
 * written, or hand-edited `reveal` still plays sensibly.
 */
export function resolveReveal(question: Pick<Question, "reveal">): RevealSettings {
  const raw = (
    question.reveal && typeof question.reveal === "object" ? question.reveal : {}
  ) as Partial<RevealSettings>;
  const animation =
    typeof raw.animation === "string" && Object.prototype.hasOwnProperty.call(REVEAL_ANIMATIONS, raw.animation)
      ? raw.animation
      : REVEAL_DEFAULTS.animation;
  const sound: CueSound | null =
    raw.sound === null
      ? null
      : typeof raw.sound === "string" && Object.prototype.hasOwnProperty.call(BUILT_IN_SOUNDS, raw.sound)
        ? raw.sound
        : REVEAL_DEFAULTS.sound;
  const out: RevealSettings = {
    animation,
    durationMs: num(raw.durationMs, REVEAL_DEFAULTS.durationMs, REVEAL_TIMING.minMs, REVEAL_TIMING.maxMs, true),
    coverFallback: raw.coverFallback === "blur" ? "blur" : "color",
    tiles: num(raw.tiles, REVEAL_DEFAULTS.tiles, 2, 16, true),
    zoom: num(raw.zoom, REVEAL_DEFAULTS.zoom, 1.2, 10),
    focusX: num(raw.focusX, REVEAL_DEFAULTS.focusX, 0, 1),
    focusY: num(raw.focusY, REVEAL_DEFAULTS.focusY, 0, 1),
    sound,
  };
  if (isMediaRef(raw.cover)) out.cover = raw.cover;
  if (typeof raw.coverColor === "string" && raw.coverColor.trim()) out.coverColor = raw.coverColor;
  if (typeof raw.caption === "string" && raw.caption.trim()) out.caption = raw.caption;
  return out;
}

/* ----------------------------------------------------------------- progress */

/** 0 while hidden (`sinceReveal` null or negative), 1 once fully uncovered. */
export function revealProgress(sinceReveal: number | null, durationMs: number): number {
  if (sinceReveal === null || sinceReveal <= 0) return 0;
  return clamp01(sinceReveal / Math.max(1, durationMs));
}

const easeInOut = cubicBezier([0.42, 0, 0.58, 1]);
const easeOut = cubicBezier([0, 0, 0.58, 1]);
const easeIn = cubicBezier([0.42, 0, 1, 1]);

/** Columns × rows of roughly square tiles over a picture of this aspect (w / h). */
export function tileGrid(cols: number, aspect: number): { cols: number; rows: number } {
  const c = Math.max(1, Math.round(cols));
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3;
  return { cols: c, rows: Math.min(32, Math.max(1, Math.round(c / a))) };
}

/**
 * Tile flip: a diagonal sweep from the top-left. Each tile's own flip takes
 * `tileSpan` of the whole; returns that tile's local progress 0→1.
 */
export function tileFlipProgress(p: number, col: number, row: number, cols: number, rows: number): number {
  const span = REVEAL_TIMING.tileSpan;
  const order = cols + rows > 2 ? (col + row) / (cols + rows - 2) : 0;
  const local = (p - order * (1 - span)) / span;
  // Snap float dust (the last tile computes 0.9999…) so every tile truly lands.
  return local >= 1 - 1e-9 ? 1 : easeInOut(clamp01(local));
}

/** A flipping tile's horizontal squash (1 → 0 → 1) and which face shows. */
export function flipFace(local: number): { scaleX: number; face: "cover" | "image" } {
  return { scaleX: Math.abs(Math.cos(Math.PI * clamp01(local))), face: local < 0.5 ? "cover" : "image" };
}

/**
 * Pixelate: blocks across the picture, growing geometrically from `startCols`
 * to "sharp" (0 is returned once it's finer than the eye can tell).
 */
export function pixelBlocks(p: number, startCols: number, widthPx: number): number {
  if (p >= 1) return 0;
  const start = Math.max(1, startCols);
  const end = Math.max(start + 1, widthPx / 2);
  const blocks = Math.round(start * Math.pow(end / start, easeIn(clamp01(p))));
  return blocks >= end ? 0 : blocks;
}

/** Blur radius in CSS px: strong enough to hide the picture at 0, gone at 1. */
export function blurRadius(p: number, width: number, height: number): number {
  const max = Math.max(8, Math.min(width, height) * 0.09);
  return max * (1 - easeOut(clamp01(p)));
}

/**
 * Zoom: which window of the picture is visible, as fractions of the picture.
 * Starts `zoom`× in around the focus point and pulls back to the whole picture,
 * always staying inside it.
 */
export function zoomWindow(
  p: number,
  zoom: number,
  focusX: number,
  focusY: number,
): { x: number; y: number; w: number; h: number } {
  const e = easeInOut(clamp01(p));
  const scale = lerp(Math.max(1, zoom), 1, e);
  const size = 1 / scale;
  const cx = lerp(focusX, 0.5, e);
  const cy = lerp(focusY, 0.5, e);
  const x = Math.min(1 - size, Math.max(0, cx - size / 2));
  const y = Math.min(1 - size, Math.max(0, cy - size / 2));
  return { x, y, w: size, h: size };
}

/** Curtain / wipes / fade / flip all run on one eased 0→1. */
export function coverTravel(p: number): number {
  return easeInOut(clamp01(p));
}

/** Iris: hole radius as a fraction of the distance from the focus to the farthest corner. */
export function irisRadius(p: number): number {
  return easeIn(clamp01(p));
}

export interface ShatterPiece {
  dx: number;
  dy: number;
  rotate: number;
  opacity: number;
  scale: number;
}

/**
 * Shatter: each piece of the cover flies out from the focus point, falls, spins
 * and fades. Seeded per piece, so the same piece always breaks the same way.
 * Offsets are fractions of the picture's width / height.
 */
export function shatterPiece(
  p: number,
  col: number,
  row: number,
  cols: number,
  rows: number,
  focusX = 0.5,
  focusY = 0.5,
): ShatterPiece {
  const rand = mulberry32(1 + col * 131 + row * 7919);
  const cx = (col + 0.5) / cols - focusX;
  const cy = (row + 0.5) / rows - focusY;
  const dist = Math.hypot(cx, cy);
  const maxDist = Math.hypot(Math.max(focusX, 1 - focusX), Math.max(focusY, 1 - focusY)) || 1;
  const span = REVEAL_TIMING.tileSpan + 0.15;
  // Pieces nearest the impact go first.
  const local = clamp01((p - (dist / maxDist) * (1 - span) - rand() * 0.05) / span);
  const e = easeIn(local);
  const angle = Math.atan2(cy, cx) + (rand() - 0.5) * 0.8;
  const speed = 0.35 + rand() * 0.4;
  return {
    dx: Math.cos(angle) * speed * e,
    dy: Math.sin(angle) * speed * e + 0.9 * e * e,
    rotate: (rand() - 0.5) * 540 * e,
    opacity: clamp01(1 - local * 1.1),
    scale: lerp(1, 0.7, e),
  };
}

/** Card flip: rotation in degrees (0 = cover facing, 180 = picture facing). */
export function cardFlipAngle(p: number): number {
  return 180 * easeInOut(clamp01(p));
}

/** The caption pops in once the picture is fully uncovered. */
export function captionProgress(sinceReveal: number | null, durationMs: number, popMs: number): number {
  if (sinceReveal === null) return 0;
  return clamp01((sinceReveal - durationMs) / Math.max(1, popMs));
}

/* ------------------------------------------------------------------ helpers */

/** The "color" cover fallback when the author didn't pick one: the theme accent, darkened. */
export function revealFallbackColor(accent: string): string {
  return mixColor(accent, "#0b0d1a", 0.55);
}

/**
 * The picture box's aspect (w / h). Stored pictures carry their size; URL
 * pictures use their decoded size once known; anything else gets 4:3.
 */
export function revealAspect(ref: MediaRef | undefined, natural?: { width: number; height: number } | null): number {
  if (natural && natural.width > 0 && natural.height > 0) return natural.width / natural.height;
  if (ref?.kind === "stored" && ref.w > 0 && ref.h > 0) return ref.w / ref.h;
  return 4 / 3;
}

const popEase = cubicBezier(POP_IN.ease);

/**
 * The caption's `.animate-pop` (opacity, 8px rise, 0.97 → 1 scale), starting
 * once the picture is fully uncovered.
 */
export function captionPose(
  sinceReveal: number | null,
  durationMs: number,
): { opacity: number; y: number; scale: number } {
  const p = popEase(captionProgress(sinceReveal, durationMs, POP_IN.durationMs));
  return { opacity: p, y: 8 * (1 - p), scale: lerp(0.97, 1, p) };
}
