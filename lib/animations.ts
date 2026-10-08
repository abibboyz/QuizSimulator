/**
 * The built-in cue animations, described rather than drawn.
 *
 * Kept free of React and the DOM so the builder's dropdown, the cue resolver,
 * and the test runner can all import it. `CuePlayer` owns the actual rendering.
 */

import type { CueAnimation } from "@/types/quiz";

export interface AnimationInfo {
  label: string;
  /** What the editor seeds `durationMs` with when this one is picked. */
  defaultMs: number;
  /** Draws nothing without an uploaded picture. */
  needsMedia?: boolean;
}

export const ANIMATIONS: Record<CueAnimation, AnimationInfo> = {
  // Long enough for three beats and a "Go" without dragging.
  countdown: { label: "3 · 2 · 1 · Go", defaultMs: 3200 },
  confetti: { label: "Confetti burst", defaultMs: 1600 },
  stars: { label: "Star shower", defaultMs: 1600 },
  "shooting-star": { label: "Shooting star", defaultMs: 1400 },
  fireworks: { label: "Fireworks", defaultMs: 1800 },
  hearts: { label: "Floating hearts", defaultMs: 1700 },
  bubbles: { label: "Bubbles", defaultMs: 1800 },
  "sparkle-wave": { label: "Sparkle wave", defaultMs: 1500 },
  "glass-assemble": { label: "Glass assemble", defaultMs: 1500 },
  butterfly: { label: "Butterfly", defaultMs: 1700 },
  "mosaic-assemble": { label: "Mosaic assemble", defaultMs: 1500 },
  "spiral-assemble": { label: "Spiral assemble", defaultMs: 1700 },
  "curtain-assemble": { label: "Curtain assemble", defaultMs: 1400 },
  "flip-assemble": { label: "Flip-tile assemble", defaultMs: 1500 },
  "zoom-assemble": { label: "Zoom-fragment assemble", defaultMs: 1400 },
  "pulse-ring": { label: "Pulse ring", defaultMs: 900 },
  shake: { label: "Screen shake", defaultMs: 600 },
  stamp: { label: "Stamp", defaultMs: 1100 },
  image: { label: "Custom image / GIF", defaultMs: 2000, needsMedia: true },
};

export const ANIMATION_IDS = Object.keys(ANIMATIONS) as CueAnimation[];

export function needsMedia(animation: CueAnimation | null): boolean {
  return !!animation && ANIMATIONS[animation]?.needsMedia === true;
}
