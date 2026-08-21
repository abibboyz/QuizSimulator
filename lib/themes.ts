import type { BgAnimation, FontChoice, Theme, ThemePreset } from "@/types/quiz";

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
];

/**
 * The fixed answer-tile palette. Quiz games lean on stable colour+shape pairs so
 * players can lock onto an answer before they've finished reading it.
 */
export const OPTION_STYLES = [
  { bg: "#e11d48", shape: "▲", name: "red" },
  { bg: "#2563eb", shape: "◆", name: "blue" },
  { bg: "#f59e0b", shape: "●", name: "amber" },
  { bg: "#16a34a", shape: "■", name: "green" },
  { bg: "#9333ea", shape: "★", name: "purple" },
  { bg: "#0891b2", shape: "⬢", name: "cyan" },
];

export function optionStyle(index: number) {
  return OPTION_STYLES[index % OPTION_STYLES.length];
}

export function getPreset(id: ThemePreset): PresetDefinition {
  return THEME_PRESETS.find((p) => p.id === id) ?? THEME_PRESETS[0];
}

export const DEFAULT_THEME: Theme = {
  preset: "neon",
  bgAnimation: "particles",
  accent: THEME_PRESETS[0].accent,
  surface: THEME_PRESETS[0].surface,
  font: "display",
};

/** Turns a theme into the CSS custom properties the components read. */
export function themeVars(theme: Theme): React.CSSProperties {
  const preset = getPreset(theme.preset);
  const font = FONT_CHOICES.find((f) => f.id === theme.font) ?? FONT_CHOICES[0];
  return {
    "--accent": theme.accent,
    "--surface": theme.surface,
    "--glow": preset.glow,
    "--accent-soft": withAlpha(theme.accent, 0.16),
    "--accent-line": withAlpha(theme.accent, 0.35),
    "--quiz-font": font.varName,
  } as React.CSSProperties;
}

/** #rrggbb -> rgba(). Falls back to the input if it isn't a plain hex colour. */
export function withAlpha(hex: string, alpha: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Relative luminance, used to decide whether text on a custom accent should be
 * black or white. Keeps the builder honest when someone picks a pale accent.
 */
export function readableTextOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const int = parseInt(m[1], 16);
  const channels = [(int >> 16) & 255, (int >> 8) & 255, int & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.45 ? "#0a0a0a" : "#ffffff";
}
