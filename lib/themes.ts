import type { BgAnimation, FontChoice, Theme, ThemePreset } from "@/types/quiz";
import { DARK_INK, themeInk } from "@/lib/themeInk";
export { DARK_INK, themeInk } from "@/lib/themeInk";
import { AGE_BANDS } from "@/lib/ageBands";
import { DEFAULT_CORRECT_COLOR, DEFAULT_WRONG_COLOR, withAlpha } from "@/lib/color";

// Palettes and colour maths live in their own modules; re-exported here so the
// components that already import them from "@/lib/themes" keep working.
export { OPTION_STYLES, optionPalette, optionStyle } from "@/lib/ageBands";
export {
  DEFAULT_CORRECT_COLOR,
  DEFAULT_WRONG_COLOR,
  contrastRatio,
  readableTextOn,
  relativeLuminance,
  withAlpha,
} from "@/lib/color";

export interface PresetDefinition {
  id: ThemePreset;
  label: string;
  accent: string;
  surface: string;
  /** Second colour used by the animated backgrounds and card gradients. */
  glow: string;
  defaultBg: BgAnimation;
}

export const THEME_PRESETS: PresetDefinition[] = [
  { id: "sunshine", label: "Sunshine", accent: "#b45309", surface: "#fff7d6", glow: "#f59e0b", defaultBg: "shapes" },
  { id: "ocean", label: "Ocean", accent: "#0369a1", surface: "#e0f7ff", glow: "#38bdf8", defaultBg: "particles" },
  { id: "garden", label: "Garden", accent: "#15803d", surface: "#ecfccb", glow: "#4ade80", defaultBg: "shapes" },
  { id: "bubblegum", label: "Bubblegum", accent: "#a21caf", surface: "#fce7f3", glow: "#c084fc", defaultBg: "aurora" },
  { id: "neon", label: "Neon", accent: "#22d3ee", surface: "#070b1a", glow: "#6366f1", defaultBg: "particles" },
  { id: "sunset", label: "Sunset", accent: "#fb7185", surface: "#1a0a14", glow: "#f59e0b", defaultBg: "aurora" },
  { id: "forest", label: "Forest", accent: "#4ade80", surface: "#04120c", glow: "#14b8a6", defaultBg: "shapes" },
  { id: "candy", label: "Candy", accent: "#c084fc", surface: "#150c26", glow: "#f472b6", defaultBg: "aurora" },
  { id: "mono", label: "Mono", accent: "#e4e4e7", surface: "#0a0a0a", glow: "#71717a", defaultBg: "starfield" },
];


export const BG_ANIMATIONS: { id: BgAnimation; label: string }[] = [
  { id: "aurora", label: "Aurora" },
  { id: "particles", label: "Particles" },
  { id: "shapes", label: "Floating shapes" },
  { id: "starfield", label: "Starfield" },
  { id: "none", label: "None" },
];

export const FONT_CHOICES: { id: FontChoice; label: string; varName: string }[] = [
  { id: "display", label: "Display", varName: "var(--font-display)" },
  { id: "sans", label: "Sans", varName: "var(--font-sans)" },
  { id: "mono", label: "Mono", varName: "var(--font-mono)" },
  { id: "georgia", label: "Georgia", varName: "Georgia, serif" },
  { id: "arial", label: "Arial", varName: "Arial, sans-serif" },
  { id: "verdana", label: "Verdana", varName: "Verdana, sans-serif" },
  { id: "trebuchet", label: "Trebuchet", varName: '"Trebuchet MS", sans-serif' },
  { id: "times", label: "Times", varName: '"Times New Roman", serif' },
  { id: "courier", label: "Courier", varName: '"Courier New", monospace' },
  { id: "comic", label: "Comic Sans", varName: '"Comic Sans MS", cursive' },
  { id: "helvetica", label: "Helvetica", varName: "Helvetica, Arial, sans-serif" },
  { id: "helvetica-neue", label: "Helvetica Neue", varName: "\"Helvetica Neue\", Helvetica, sans-serif" },
  { id: "avenir", label: "Avenir", varName: "Avenir, sans-serif" },
  { id: "avenir-next", label: "Avenir Next", varName: "\"Avenir Next\", sans-serif" },
  { id: "futura", label: "Futura", varName: "Futura, sans-serif" },
  { id: "gill-sans", label: "Gill Sans", varName: "\"Gill Sans\", sans-serif" },
  { id: "tahoma", label: "Tahoma", varName: "Tahoma, sans-serif" },
  { id: "segoe", label: "Segoe UI", varName: "\"Segoe UI\", sans-serif" },
  { id: "calibri", label: "Calibri", varName: "Calibri, sans-serif" },
  { id: "candara", label: "Candara", varName: "Candara, sans-serif" },
  { id: "century-gothic", label: "Century Gothic", varName: "\"Century Gothic\", sans-serif" },
  { id: "optima", label: "Optima", varName: "Optima, sans-serif" },
  { id: "palatino", label: "Palatino", varName: "Palatino, serif" },
  { id: "baskerville", label: "Baskerville", varName: "Baskerville, serif" },
  { id: "garamond", label: "Garamond", varName: "Garamond, serif" },
  { id: "cambria", label: "Cambria", varName: "Cambria, serif" },
  { id: "didot", label: "Didot", varName: "Didot, serif" },
  { id: "bodoni", label: "Bodoni 72", varName: "\"Bodoni 72\", serif" },
  { id: "book-antiqua", label: "Book Antiqua", varName: "\"Book Antiqua\", serif" },
  { id: "american-typewriter", label: "American Typewriter", varName: "\"American Typewriter\", serif" },
  { id: "menlo", label: "Menlo", varName: "Menlo, monospace" },
  { id: "monaco", label: "Monaco", varName: "Monaco, monospace" },
  { id: "consolas", label: "Consolas", varName: "Consolas, monospace" },
  { id: "andale", label: "Andale Mono", varName: "\"Andale Mono\", monospace" },
  { id: "impact", label: "Impact", varName: "Impact, fantasy" },
  { id: "copperplate", label: "Copperplate", varName: "Copperplate, fantasy" },
  { id: "papyrus", label: "Papyrus", varName: "Papyrus, fantasy" },
  { id: "brush-script", label: "Brush Script", varName: "\"Brush Script MT\", cursive" },
  { id: "snell", label: "Snell Roundhand", varName: "\"Snell Roundhand\", cursive" },
  { id: "chalkboard", label: "Chalkboard", varName: "Chalkboard, cursive" },
  { id: "noteworthy", label: "Noteworthy", varName: "Noteworthy, cursive" },
  { id: "custom", label: "Custom", varName: "sans-serif" },
];

export const FONT_GROUPS = [
  { label: "Included fonts", choices: FONT_CHOICES.filter((font) => ["display", "sans", "mono"].includes(font.id)) },
  { label: "Sans serif", choices: FONT_CHOICES.filter((font) => font.id !== "custom" && font.varName.endsWith("sans-serif")) },
  { label: "Serif", choices: FONT_CHOICES.filter((font) => font.varName.endsWith(", serif")) },
  { label: "Monospace", choices: FONT_CHOICES.filter((font) => font.varName.endsWith("monospace")) },
  { label: "Handwriting & decorative", choices: FONT_CHOICES.filter((font) => /cursive|fantasy/.test(font.varName)) },
  { label: "Other", choices: FONT_CHOICES.filter((font) => font.id === "custom") },
];

/** Quote a single installed font name, with a portable fallback. */
export function fontFamily(font: FontChoice, custom?: string, loaded?: { sans: string; mono: string; display: string }): string {
  if (font === "custom") return custom?.trim() ? `${JSON.stringify(custom.trim())}, sans-serif` : "sans-serif";
  if (loaded && (font === "sans" || font === "mono" || font === "display")) return loaded[font];
  return (FONT_CHOICES.find((choice) => choice.id === font) ?? FONT_CHOICES[0]).varName;
}

/** Age bands double as theme presets so `getPreset` can resolve their glow. */
const BAND_PRESETS: PresetDefinition[] = AGE_BANDS.map((band) => ({
  id: band.id,
  label: band.label,
  accent: band.accent,
  surface: band.surface,
  glow: band.glow,
  // Bands never move the background animation, so this is only ever read as a
  // value, never applied. See ThemePanel.
  defaultBg: "none",
}));

export function getPreset(id: ThemePreset): PresetDefinition {
  return [...THEME_PRESETS, ...BAND_PRESETS].find((p) => p.id === id) ?? THEME_PRESETS.find((p) => p.id === "neon")!;
}

export const DEFAULT_THEME: Theme = {
  preset: "neon",
  bgAnimation: "particles",
  accent: "#22d3ee",
  surface: "#070b1a",
  font: "display",
  bgImageFit: "cover",
  bgImageDim: 0.45,
};

/** Turns a theme into the CSS custom properties the components read. */
export function themeVars(theme: Theme): React.CSSProperties {
  const preset = getPreset(theme.preset);
  const ink = themeInk(theme);
  return {
    ...Object.fromEntries(Object.entries(ink).map(([shade, color]) => [`--color-ink-${shade}`, color])),
    colorScheme: ink === DARK_INK ? "dark" : "light",
    "--accent": theme.accent,
    "--surface": theme.surface,
    "--glow": preset.glow,
    "--accent-soft": withAlpha(theme.accent, 0.16),
    "--accent-line": withAlpha(theme.accent, 0.35),
    "--quiz-font": fontFamily(theme.font, theme.customFont),
    // Each falls back to the value that was hardcoded before these were
    // configurable, so a quiz saved without them renders exactly as it did.
    "--prompt-color": theme.promptColor ?? ink[100],
    "--title-color": theme.titleColor ?? ink[100],
    "--explanation-color": theme.explanationColor ?? ink[200],
    // Overriding the globals inside the themed surface, so the timer ring and
    // the results breakdown follow the quiz's reveal colours too. Builder
    // chrome sits outside ThemeShell and keeps the standard green/red.
    "--color-good": theme.correctColor ?? DEFAULT_CORRECT_COLOR,
    "--color-bad": theme.wrongColor ?? DEFAULT_WRONG_COLOR,
  } as React.CSSProperties;
}

