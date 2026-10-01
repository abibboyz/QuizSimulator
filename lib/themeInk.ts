import type { Theme } from "@/types/quiz";
import { mixHex, relativeLuminance } from "@/lib/color";

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

const LIGHT_SURFACE = 0.1791;

function lightSurface(surface: string): boolean {
  return (relativeLuminance(surface) ?? 0) > LIGHT_SURFACE;
}

/**
 * The colour the stage gradient fades to. Dark themes keep the near-black edge.
 * Light themes only deepen their own surface, so the dark text those themes use
 * does not sit on black.
 */
export function stageEdge(surface: string): string {
  if (!lightSurface(surface)) return "#04050a";
  return mixHex(surface, "#1e293b", 0.22);
}

/** Outer vignette. Dark themes keep the existing black wash. */
export function stageVignette(surface: string): string {
  if (!lightSurface(surface)) return "rgba(0,0,0,0.55)";
  return "rgba(15, 23, 42, 0.16)";
}

