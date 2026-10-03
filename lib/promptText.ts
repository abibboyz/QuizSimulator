import { contrastRatio, readableTextOn } from "./color.ts";

/** Sizes offered on the prompt. The number is the web play size, in pixels. */

export type PromptAlign = "left" | "center" | "right";

const EMOJI_FONTS = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji"';

let segmenter: Intl.Segmenter | null | undefined;

function graphemesOf(text: string): string[] {
  if (segmenter === undefined) {
    segmenter = typeof Intl !== "undefined" && typeof Intl.Segmenter === "function"
      ? new Intl.Segmenter(undefined, { granularity: "grapheme" })
      : null;
  }
  if (!segmenter) return [...text];
  return [...segmenter.segment(text)].map((part) => part.segment);
}

/** One visible character each: a space, Enter, a letter, or a whole emoji. */
export function promptGraphemes(text: string): string[] {
  return graphemesOf(text);
}

/** Every visible character, so a space, Enter, and an emoji each count as one. */
export function promptCharCount(text: string): number {
  return graphemesOf(text).length;
}

/** Author's face first, then colour emoji fonts, then a generic fallback. */
export function promptFontStack(family: string): string {
  const generic = /,\s*(?:serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.exec(family);
  if (generic) return `${family.slice(0, generic.index)}, ${EMOJI_FONTS}${family.slice(generic.index)}`;
  if (/^(?:serif|sans-serif|monospace|cursive|fantasy|system-ui)$/i.test(family.trim())) return `${EMOJI_FONTS}, ${family}`;
  return `${family}, ${EMOJI_FONTS}`;
}

function emojiGrapheme(glyph: string): boolean {
  return /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(glyph);
}

export function promptHasEmoji(text: string): boolean {
  return graphemesOf(text).some(emojiGrapheme);
}

/** Runs of ordinary text and emoji, so an outline can skip the emoji glyphs. */
export function splitEmojiRuns(text: string): { text: string; emoji: boolean }[] {
  const runs: { text: string; emoji: boolean }[] = [];
  for (const glyph of graphemesOf(text)) {
    const emoji = emojiGrapheme(glyph);
    const last = runs[runs.length - 1];
    if (last && last.emoji === emoji) last.text += glyph;
    else runs.push({ text: glyph, emoji });
  }
  return runs;
}

/** A run of spaces, a tab, or Enter — wrapping has to keep these visible. */
export function promptPreservesBreaks(text: string): boolean {
  return / {2,}|\n|\t/.test(text);
}

/** Unset stays centered, which is how every existing prompt is drawn. */
export function promptAlign(style: { align?: string } | undefined): PromptAlign {
  return style?.align === "left" || style?.align === "right" ? style.align : "center";
}

/**
 * Pixel size for one surface. The editable default is 24px on web play;
 * other surfaces scale from the 30px web play reference.
 */
export function promptFontSize(style: { fontSize?: number } | undefined, base: number): number {
  const n = style?.fontSize;
  const chosen = typeof n === "number" && Number.isFinite(n)
    ? Math.min(150, Math.max(12, Math.round(n))) : 24;
  return Math.max(8, Math.round((base * chosen) / 30));
}

export interface PromptLine {
  /** Glyphs to draw. A line break is not included; it is the gap before the next line. */
  text: string;
  /** Character index of `text` in the original prompt. */
  start: number;
  /** Character index just after this line, including a line break it consumed. */
  end: number;
}

/**
 * Lines of a prompt. Enter starts a new line and still counts. Spaces stay in
 * the line they belong to, including a space that a wrap breaks after.
 */
export function layoutPrompt(text: string, widthOf: (sample: string) => number, maxWidth: number): PromptLine[] {
  const glyphs = graphemesOf(text);
  const lines: PromptLine[] = [];
  let i = 0;
  while (i < glyphs.length) {
    const start = i;
    let end = i;
    while (end < glyphs.length && glyphs[end] !== "\n") {
      if (end > start && widthOf(glyphs.slice(start, end + 1).join("")) > maxWidth) break;
      end += 1;
      if (widthOf(glyphs.slice(start, end).join("")) > maxWidth) break;
    }
    if (end < glyphs.length && glyphs[end] !== "\n") {
      const chunk = glyphs.slice(start, end);
      let space = -1;
      for (let k = chunk.length - 1; k > 0; k--) {
        if (chunk[k] === " ") {
          space = k;
          break;
        }
      }
      if (space > 0 && space < chunk.length - 1) end = start + space + 1;
    }
    let next = end;
    if (next < glyphs.length && glyphs[next] === "\n") next += 1;
    lines.push({ text: glyphs.slice(start, next > end ? end : next).join(""), start, end: next });
    i = next === start ? start + 1 : next;
    if (next === start) lines[lines.length - 1] = { text: glyphs[start] === "\n" ? "" : glyphs[start], start, end: i };
  }
  return lines;
}

/** Styles offered next to the prompt, the same idea as the emoji grid. */
export const WORD_ART_STYLES = [
  { id: "classic", label: "Classic" },
  { id: "outline", label: "Outline" },
  { id: "retro", label: "Retro" },
  { id: "glow", label: "Glow" },
  { id: "bubble", label: "Bubble" },
  { id: "comic", label: "Comic" },
  { id: "echo", label: "Echo" },
  { id: "spark", label: "Spark" },
] as const;

export type WordArtStyle = (typeof WORD_ART_STYLES)[number]["id"];

export interface WordArtPaint {
  fill: string;
  stroke: string;
  shadow: string;
  /** 1 matches the original outline. 0 draws no rim. */
  strokeWidth: number;
  /** Soft glow as a fraction of the font size. 0 is a hard edge. */
  blur: number;
  /** Drop distance as a fraction of the original offset. 0 sits under the letters. */
  drop: number;
  /** Extra offset copies. 1 is a single shadow. */
  layers: number;
}

/** `true` is the original accent outline. Anything else off stays off. */
export function wordArtStyleOf(value: boolean | string | undefined): WordArtStyle | null {
  if (value === true || value === "classic") return "classic";
  if (typeof value === "string" && WORD_ART_STYLES.some((style) => style.id === value)) return value as WordArtStyle;
  return null;
}

/**
 * Colours for one Word Art style. Classic is the original accent fill with a
 * contrasting rim. Every style keeps a fill or a rim that can be read on the
 * stage, including light themes such as Sunshine.
 */
export function wordArtInk(accent: string, surface: string, style: WordArtStyle | boolean = "classic"): WordArtPaint {
  const id = wordArtStyleOf(style === false ? undefined : style) ?? "classic";
  const paper = readableTextOn(surface);
  const rim = readableTextOn(accent);
  const classic: WordArtPaint = { fill: accent, stroke: rim, shadow: paper, strokeWidth: 1, blur: 0, drop: 1, layers: 1 };
  switch (id) {
    case "outline":
      return { fill: surface, stroke: paper, shadow: accent, strokeWidth: 2.2, blur: 0, drop: 0.35, layers: 1 };
    case "retro":
      return { fill: accent, stroke: rim, shadow: paper, strokeWidth: 1, blur: 0, drop: 1, layers: 4 };
    case "glow":
      return { fill: paper, stroke: paper, shadow: accent, strokeWidth: 0.35, blur: 0.45, drop: 0, layers: 1 };
    case "bubble":
      return { fill: paper, stroke: accent, shadow: paper, strokeWidth: 2, blur: 0, drop: 0.65, layers: 1 };
    case "comic":
      return { fill: accent, stroke: "#0a0a0a", shadow: paper, strokeWidth: 1.7, blur: 0, drop: 0.8, layers: 1 };
    case "echo":
      return { fill: paper, stroke: paper, shadow: accent, strokeWidth: 0, blur: 0, drop: 0.85, layers: 3 };
    case "spark":
      return { fill: accent, stroke: rim, shadow: accent, strokeWidth: 0.5, blur: 0.4, drop: 0, layers: 1 };
    default:
      return classic;
  }
}

/** The text-shadow that draws a style in the browser. Classic matches the original rim. */
export function wordArtCss(paint: WordArtPaint, px: number): string {
  const shadows: string[] = [];
  if (paint.strokeWidth > 0) {
    const ring = Math.max(1, Math.round(px * 0.06 * paint.strokeWidth));
    const rings = paint.strokeWidth > 1.4 ? [ring, Math.max(1, Math.round(ring * 0.55))] : [ring];
    for (const r of rings) {
      shadows.push(
        `${r}px 0 0 ${paint.stroke}`,
        `-${r}px 0 0 ${paint.stroke}`,
        `0 ${r}px 0 ${paint.stroke}`,
        `0 -${r}px 0 ${paint.stroke}`,
        `${r}px ${r}px 0 ${paint.stroke}`,
        `-${r}px ${r}px 0 ${paint.stroke}`,
        `${r}px -${r}px 0 ${paint.stroke}`,
        `-${r}px -${r}px 0 ${paint.stroke}`,
      );
    }
  }
  const blur = Math.round(px * paint.blur);
  const blurCss = blur ? `${blur}px` : "0";
  const drop = paint.drop === 0 ? 0 : Math.max(2, Math.round(px * 0.12 * paint.drop));
  for (let i = 1; i <= paint.layers; i++) {
    shadows.push(`${drop * i}px ${drop * i}px ${blurCss} ${paint.shadow}`);
  }
  return shadows.join(", ");
}

/** A style can be read on this stage: the fill, or a real outline, stands off the surface. */
export function wordArtReadable(paint: WordArtPaint, surface: string): boolean {
  const fill = contrastRatio(paint.fill, surface) ?? 0;
  const stroke = contrastRatio(paint.stroke, surface) ?? 0;
  if (paint.strokeWidth >= 1 && stroke >= 3) return true;
  return fill >= 3;
}
