/**
 * Bubbly 3D cartoon lettering, shared by every surface.
 *
 * One painter (`paintStyledText` / `paintStyledLines`) draws the letters on a
 * canvas: a soft white rim, a dark extrusion down-right, a thick dark outline,
 * a vertical gradient (or picture) fill and a glossy highlight band near the
 * top of each glyph. The prompt already renders through a canvas everywhere
 * (lib/promptRenderer), and styled answer text renders through a small canvas
 * in the DOM (components/play/StyledText) and the video renderer, so builder
 * preview, play, host and export all draw the same pixels from this file.
 *
 * `plain` (the default, and what any quiz saved before this resolves to) is
 * never painted here: callers keep their existing text path untouched.
 *
 * Imports stay type-only / relative so `node --test` can load the maths.
 */

import type { MediaRef, TextStylePreset, TextStyleSetting } from "../types/quiz.ts";

export const TEXT_STYLE_PRESETS: { id: TextStylePreset; label: string; top: string; bottom: string }[] = [
  { id: "plain", label: "Plain", top: "", bottom: "" },
  { id: "bubble-pink", label: "Bubble Pink", top: "#ffc2e2", bottom: "#ff2e93" },
  { id: "sunny-yellow", label: "Sunny Yellow", top: "#fff7a8", bottom: "#ffc107" },
  { id: "orange-pop", label: "Orange Pop", top: "#ffd08a", bottom: "#ff6a00" },
  { id: "sky-blue", label: "Sky Blue", top: "#bfeaff", bottom: "#1e9bf0" },
  { id: "candy", label: "Candy", top: "#ffc2e2", bottom: "#ff2e93" },
  { id: "custom", label: "Custom", top: "#fff7a8", bottom: "#ff6a00" },
];

/** Candy cycles the reference's line colours: pink, yellow, orange, sky blue, yellow. */
export const CANDY_PALETTE: [string, string][] = [
  ["#ffc2e2", "#ff2e93"],
  ["#fff7a8", "#ffc107"],
  ["#ffd08a", "#ff6a00"],
  ["#bfeaff", "#1e9bf0"],
  ["#fff7a8", "#ffc107"],
];

export const DEFAULT_OUTLINE = "#1b1020";
export const RIM_COLOR = "rgba(255,255,255,0.95)";
export const MAX_DEPTH = 2;

/** Fractions of the font size. Outline and rim grow outward from the glyph; depth goes down-right. */
export const OUTLINE_EM = 0.085;
export const RIM_EM = 0.045;
export const DEPTH_EM = 0.09;

const HEX = /^#[0-9a-f]{6}$/i;
const PRESET_IDS = new Set(TEXT_STYLE_PRESETS.map((p) => p.id));

function hexOr(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX.test(value.trim()) ? value.trim().toLowerCase() : fallback;
}

function isMediaRef(value: unknown): value is MediaRef {
  if (!value || typeof value !== "object") return false;
  const ref = value as { kind?: unknown; id?: unknown; url?: unknown };
  return (ref.kind === "stored" && typeof ref.id === "string") || (ref.kind === "url" && typeof ref.url === "string");
}

/**
 * Cleans a stored or imported setting. Anything unknown or missing is Plain,
 * so an older quiz (no value) and a hand-edited file both come out safe.
 */
export function normalizeTextStyle(value: unknown): TextStyleSetting {
  if (!value || typeof value !== "object") return { preset: "plain" };
  const raw = value as Partial<TextStyleSetting>;
  const preset = typeof raw.preset === "string" && PRESET_IDS.has(raw.preset) ? raw.preset : "plain";
  if (preset === "plain") return { preset };
  const out: TextStyleSetting = { preset };
  if (preset === "custom") {
    const base = TEXT_STYLE_PRESETS.find((p) => p.id === "custom")!;
    out.top = hexOr(raw.top, base.top);
    out.bottom = hexOr(raw.bottom, base.bottom);
    out.outline = hexOr(raw.outline, DEFAULT_OUTLINE);
    const depth = typeof raw.depth === "number" && Number.isFinite(raw.depth) ? raw.depth : 1;
    out.depth = Math.min(MAX_DEPTH, Math.max(0, depth));
    out.rim = raw.rim !== false;
  }
  if (isMediaRef(raw.image)) out.image = raw.image;
  return out;
}

/** Normalizes the text styles a theme carries, adding no keys to themes that never had one (older quizzes stay Plain and byte-identical). */
export function withTextStyles<T extends { promptTextStyle?: TextStyleSetting; answerTextStyle?: TextStyleSetting }>(theme: T): T {
  const out = { ...theme };
  if (theme.promptTextStyle !== undefined) out.promptTextStyle = normalizeTextStyle(theme.promptTextStyle);
  if (theme.answerTextStyle !== undefined) out.answerTextStyle = normalizeTextStyle(theme.answerTextStyle);
  return out;
}

export interface ResolvedTextStyle {
  preset: Exclude<TextStylePreset, "plain">;
  /** [top, bottom] gradient pairs; more than one cycles by line / tile / glyph. */
  palette: [string, string][];
  outline: string;
  /** 0–2 multiplier on DEPTH_EM. */
  depth: number;
  rim: boolean;
  image?: MediaRef;
}

/** Null means Plain: draw text exactly as before. */
export function resolveTextStyle(value: TextStyleSetting | undefined): ResolvedTextStyle | null {
  const s = normalizeTextStyle(value);
  if (s.preset === "plain") return null;
  const preset = TEXT_STYLE_PRESETS.find((p) => p.id === s.preset)!;
  const palette: [string, string][] =
    s.preset === "candy" ? CANDY_PALETTE : s.preset === "custom" ? [[s.top!, s.bottom!]] : [[preset.top, preset.bottom]];
  return {
    preset: s.preset,
    palette,
    outline: s.preset === "custom" ? s.outline! : DEFAULT_OUTLINE,
    depth: s.preset === "custom" ? s.depth! : 1,
    rim: s.preset === "custom" ? s.rim! : true,
    ...(s.image ? { image: s.image } : {}),
  };
}

export interface TextStylePadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Room the decorations need around a run of text at `px`: outline + rim all round, plus depth right and below. */
export function textStylePadding(px: number, style: Pick<ResolvedTextStyle, "depth" | "rim">): TextStylePadding {
  const size = Number.isFinite(px) && px > 0 ? px : 0;
  const edge = size * (OUTLINE_EM + (style.rim ? RIM_EM : 0));
  const depth = size * DEPTH_EM * Math.min(MAX_DEPTH, Math.max(0, style.depth));
  return { top: edge, left: edge, right: edge + depth, bottom: edge + depth };
}

/** Width left for the letters once the decoration padding is taken out of a box. Never below 1. */
export function styledWrapWidth(available: number, px: number, style: Pick<ResolvedTextStyle, "depth" | "rim">): number {
  const pad = textStylePadding(px, style);
  return Math.max(1, available - pad.left - pad.right);
}

/** The largest size ≤ `px` at which `textWidth(size)` plus padding fits `available` (0.5px steps, floor `min`). */
export function fitStyledSize(
  px: number,
  available: number,
  textWidth: (size: number) => number,
  style: Pick<ResolvedTextStyle, "depth" | "rim">,
  min = 8,
): number {
  let size = px;
  while (size > min && textWidth(size) > styledWrapWidth(available, size, style)) size -= 0.5;
  return Math.max(min, size);
}

/**
 * Greedy wrap at spaces, breaking words that can't fit on their own — the same
 * rule as the video renderer's `wrap` (CSS `break-words`), shared so the DOM
 * canvas and the export break styled lines identically.
 */
export function wrapWords(text: string, measure: (sample: string) => number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    if (measure(word) <= maxWidth) {
      current = word;
      continue;
    }
    let piece = "";
    for (const ch of Array.from(word)) {
      if (piece && measure(piece + ch) > maxWidth) {
        lines.push(piece);
        piece = ch;
      } else {
        piece += ch;
      }
    }
    current = piece;
  }
  if (current || !lines.length) lines.push(current);
  return lines;
}

/** Baseline of a line in a CSS line box whose top edge is `top` (half-leading above and below). */
export function lineBaseline(top: number, lineHeight: number, ascent: number, descent: number): number {
  return top + (lineHeight - (ascent + descent)) / 2 + ascent;
}

/* ----------------------------------------------------------------- fonts */

export const CARTOON_FONT_VAR = "--font-cartoon";
const CARTOON_FALLBACK = '"Titan One", "Arial Rounded MT Bold", ui-rounded, sans-serif';

/** The bundled heavy rounded display face (Titan One via next/font), as a canvas font-family list. */
export function cartoonFamily(): string {
  if (typeof document === "undefined") return CARTOON_FALLBACK;
  const value = getComputedStyle(document.documentElement).getPropertyValue(CARTOON_FONT_VAR).trim();
  return value ? `${value}, ${CARTOON_FALLBACK}` : CARTOON_FALLBACK;
}

/** Canvas font string for styled text. Titan One has one weight, so bold/italic never synthesise differently per surface. */
export function cartoonFont(px: number, family = cartoonFamily()): string {
  return `400 ${px}px ${family}`;
}

/** Waits for the lettering face before anything measures or draws with it (export and live). */
export async function loadCartoonFont(): Promise<void> {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await document.fonts.load(cartoonFont(32), "AaBb");
  } catch {
    // Fallback face stays; every surface falls back the same way.
  }
}

/** Whether a theme uses styled lettering anywhere (so export knows to load the face). */
export function usesTextStyle(theme: { promptTextStyle?: TextStyleSetting; answerTextStyle?: TextStyleSetting } | undefined): boolean {
  return !!(resolveTextStyle(theme?.promptTextStyle) || resolveTextStyle(theme?.answerTextStyle));
}

/* --------------------------------------------------------------- painter */

export interface StylePicture {
  source: CanvasImageSource;
  width: number;
  height: number;
}

type Ctx = CanvasRenderingContext2D;

/**
 * Paints one run of styled text with its left edge at `x` on `baseline`.
 * The caller sets `ctx.font` (cartoonFont) and any letter spacing; this only
 * adds paint. `colorIndex` picks the palette entry (Candy cycles).
 */
export function paintStyledText(
  ctx: Ctx,
  text: string,
  x: number,
  baseline: number,
  px: number,
  style: ResolvedTextStyle,
  colorIndex = 0,
  picture?: StylePicture | null,
) {
  if (!text) return;
  const outline = px * OUTLINE_EM;
  const rim = style.rim ? px * RIM_EM : 0;
  const depth = px * DEPTH_EM * Math.min(MAX_DEPTH, Math.max(0, style.depth));
  // Enough offset copies that the extrusion reads as solid at any scale.
  const steps = depth > 0 ? Math.max(2, Math.ceil(depth / Math.max(0.5, outline * 0.5))) : 0;
  const [top, bottom] = style.palette[((colorIndex % style.palette.length) + style.palette.length) % style.palette.length];

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.miterLimit = 2;
  ctx.shadowColor = "transparent";

  // 1. Soft white rim around the whole silhouette (front + extrusion).
  if (rim > 0) {
    ctx.strokeStyle = RIM_COLOR;
    ctx.lineWidth = 2 * (outline + rim);
    for (let k = steps; k >= 0; k--) {
      const o = steps ? (depth * k) / steps : 0;
      ctx.strokeText(text, x + o, baseline + o);
    }
  }

  // 2. Dark extrusion down and to the right.
  ctx.fillStyle = style.outline;
  ctx.strokeStyle = style.outline;
  ctx.lineWidth = 2 * outline;
  for (let k = steps; k >= 1; k--) {
    const o = (depth * k) / steps;
    ctx.strokeText(text, x + o, baseline + o);
    ctx.fillText(text, x + o, baseline + o);
  }

  // 3. Thick outline on the face.
  ctx.strokeText(text, x, baseline);

  // 4. Face: vertical gradient (lighter top) or the picture, covering this run.
  const glyphTop = baseline - px * 0.8;
  const glyphBottom = baseline + px * 0.12;
  let face: string | CanvasGradient | CanvasPattern = bottom;
  if (picture && typeof ctx.createPattern === "function") {
    const pattern = ctx.createPattern(picture.source, "no-repeat");
    if (pattern) {
      const w = Math.max(1, ctx.measureText(text).width);
      const h = glyphBottom - glyphTop;
      const scale = Math.max(w / Math.max(1, picture.width), h / Math.max(1, picture.height));
      const dx = x + (w - picture.width * scale) / 2;
      const dy = glyphTop + (h - picture.height * scale) / 2;
      if (typeof DOMMatrix !== "undefined" && pattern.setTransform) pattern.setTransform(new DOMMatrix([scale, 0, 0, scale, dx, dy]));
      face = pattern;
    }
  } else {
    const g = ctx.createLinearGradient(0, glyphTop, 0, glyphBottom);
    g.addColorStop(0, top);
    g.addColorStop(0.55, bottom);
    g.addColorStop(1, bottom);
    face = g;
  }
  ctx.fillStyle = face;
  ctx.fillText(text, x, baseline);

  // 5. Glossy highlight band near the top of each glyph (clipped by the glyphs themselves).
  const capTop = baseline - px * 0.74;
  const gloss = ctx.createLinearGradient(0, capTop, 0, baseline);
  gloss.addColorStop(0, "rgba(255,255,255,0)");
  gloss.addColorStop(0.06, "rgba(255,255,255,0.85)");
  gloss.addColorStop(0.3, "rgba(255,255,255,0.45)");
  gloss.addColorStop(0.42, "rgba(255,255,255,0)");
  gloss.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = gloss;
  ctx.fillText(text, x, baseline);
  ctx.restore();
}

export interface StyledLinesLayout {
  /** Left edge and width of the text box (padding is inside it). */
  x: number;
  width: number;
  /** Top of the first CSS line box. */
  top: number;
  lineHeight: number;
  px: number;
  align: "left" | "center";
  ascent: number;
  descent: number;
}

/**
 * Paints pre-wrapped lines in CSS line boxes, as both the DOM StyledText canvas
 * and the video renderer do for answers and captions. Lines are inset by the
 * left/right padding so the outline, rim and depth stay inside the box.
 */
export function paintStyledLines(
  ctx: Ctx,
  lines: string[],
  layout: StyledLinesLayout,
  style: ResolvedTextStyle,
  colorIndex = 0,
  picture?: StylePicture | null,
) {
  const pad = textStylePadding(layout.px, style);
  const inner = Math.max(1, layout.width - pad.left - pad.right);
  lines.forEach((line, i) => {
    const w = ctx.measureText(line).width;
    const x = layout.align === "center" ? layout.x + pad.left + (inner - w) / 2 : layout.x + pad.left;
    const baseline = lineBaseline(layout.top + i * layout.lineHeight, layout.lineHeight, layout.ascent, layout.descent);
    paintStyledText(ctx, line, x, baseline, layout.px, style, colorIndex + (style.palette.length > 1 ? i : 0), picture);
  });
}
