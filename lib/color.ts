/**
 * Colour maths, kept free of any project imports so it stays cheap to test and
 * can't drag the theme graph into a plain `node --test` run.
 */

const HEX = /^#?([0-9a-f]{6})$/i;

/**
 * The reveal colours. Green for right and red for wrong is the convention
 * players already read without being told, so these are the defaults — but
 * they're overridable, which matters most when an author has coloured the
 * resting tiles green or red themselves.
 */
export const DEFAULT_CORRECT_COLOR = "#22c55e";
export const DEFAULT_WRONG_COLOR = "#ef4444";

/** #rrggbb -> rgba(). Falls back to the input if it isn't a plain hex colour. */
export function withAlpha(hex: string, alpha: number): string {
  const m = HEX.exec(hex.trim());
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** WCAG relative luminance. Returns null if the input isn't a plain hex colour. */
export function relativeLuminance(hex: string): number | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const int = parseInt(m[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** WCAG contrast ratio, 1–21. Returns null if either colour can't be parsed. */
export function contrastRatio(a: string, b: string): number | null {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  if (la === null || lb === null) return null;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The luminance at which black and white are equally readable against a
 * background — solving (L+0.05)/0.05 = 1.05/(L+0.05). Splitting here maximises
 * contrast, and guarantees at least 4.58:1 whichever side a colour lands on.
 * A higher threshold (this used to be 0.45) leaves white text on mid-tone
 * backgrounds like amber, which measures a barely-legible 2.15:1.
 */
const BLACK_WHITE_CROSSOVER = 0.1791;

/**
 * Picks black or white text for a given background. Used to keep the builder
 * honest when someone chooses a pale accent, and to give every answer tile
 * readable label text without the author having to think about it.
 */
export function readableTextOn(hex: string): string {
  const luminance = relativeLuminance(hex);
  if (luminance === null) return "#ffffff";
  return luminance > BLACK_WHITE_CROSSOVER ? "#0a0a0a" : "#ffffff";
}

/** Mix two #rrggbb colours. `amount` 0 stays on `from`; 1 is `to`. */
export function mixHex(from: string, to: string, amount: number): string {
  const a = HEX.exec(from.trim());
  const b = HEX.exec(to.trim());
  if (!a || !b) return from;
  const t = Math.min(1, Math.max(0, amount));
  const ai = parseInt(a[1], 16);
  const bi = parseInt(b[1], 16);
  const channel = (shift: number) => {
    const av = (ai >> shift) & 255;
    const bv = (bi >> shift) & 255;
    return Math.round(av + (bv - av) * t);
  };
  return `#${[channel(16), channel(8), channel(0)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
