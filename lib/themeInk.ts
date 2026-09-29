import type { Theme } from "@/types/quiz";
import { relativeLuminance } from "@/lib/color";

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

