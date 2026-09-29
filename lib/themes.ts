import type { BgAnimation, FontChoice, Theme, ThemePreset } from "@/types/quiz";
import { AGE_BANDS } from "@/lib/ageBands";
import { DEFAULT_CORRECT_COLOR, DEFAULT_WRONG_COLOR, relativeLuminance, withAlpha } from "@/lib/color";

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

/** Shared by DOM playback and the video renderer. */
export const DARK_INK = {
  950: "#05060c", 900: "#0a0c16", 850: "#0f1120", 800: "#14172a",
  700: "#1d2136", 600: "#2b3049", 500: "#454b69", 400: "#6c7391",
  300: "#99a0bd", 200: "#c7cbdd", 100: "#e9ebf4",
};
const LIGHT_INK: typeof DARK_INK = {
  950: "#ffffff", 900: "#f8fafc", 850: "#f1f5f9", 800: "#e2e8f0",
  700: "#cbd5e1", 600: "#94a3b8", 500: "#526079", 400: "#475569",
  300: "#334155", 200: "#1e293b", 100: "#0f172a",
};
export function themeInk(theme: Theme): typeof DARK_INK {
  return (relativeLuminance(theme.surface) ?? 0) > 0.1791 ? LIGHT_INK : DARK_INK;
}

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
];

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
  const font = FONT_CHOICES.find((f) => f.id === theme.font) ?? FONT_CHOICES[0];
  return {
    ...Object.fromEntries(Object.entries(ink).map(([shade, color]) => [`--color-ink-${shade}`, color])),
    colorScheme: ink === DARK_INK ? "dark" : "light",
    "--accent": theme.accent,
    "--surface": theme.surface,
    "--glow": preset.glow,
    "--accent-soft": withAlpha(theme.accent, 0.16),
    "--accent-line": withAlpha(theme.accent, 0.35),
    "--quiz-font": font.varName,
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

