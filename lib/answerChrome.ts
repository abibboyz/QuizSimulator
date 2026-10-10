/**
 * Answer-tile chrome switches: hide the marker badge, hide the card box.
 *
 * Shared by the DOM AnswerGrid and the video renderer so play, host, the
 * builder preview, the framed preview and export agree. Both default off,
 * and when off nothing here is consulted — the tiles draw exactly as before.
 *
 * Without a box, feedback can't come from the card colour, so it moves to:
 *  - a short rounded bar along the bottom of the tile (white while picked,
 *    the correct colour with a glow, or the wrong colour),
 *  - the text and ✓ / ✕ mark tinted to the same colour,
 *  - the existing fade (opacity) for answers that were neither right nor picked.
 * The button keeps its full padding, so the tap target is the same size.
 *
 * Imports stay type-only so `node --test` can load this file.
 */

import type { Theme } from "../types/quiz.ts";

export interface AnswerChrome {
  hideMarkers: boolean;
  hideBoxes: boolean;
}

export function answerChrome(theme: Pick<Theme, "hideAnswerMarkers" | "hideAnswerBoxes"> | undefined): AnswerChrome {
  return { hideMarkers: theme?.hideAnswerMarkers === true, hideBoxes: theme?.hideAnswerBoxes === true };
}

/** Geometry of the box-less feedback bar, in CSS px of the tile. */
export const FEEDBACK_BAR = { inset: 16, bottom: 6, height: 4, glow: 12 } as const;

export type BoxlessState = "rest" | "picked" | "correct" | "wrong";

export function boxlessState(o: { revealed: boolean; correct: boolean; picked: boolean; unscored?: boolean }): BoxlessState {
  if (o.revealed && o.correct) return "correct";
  if (o.revealed && !o.unscored && o.picked && !o.correct) return "wrong";
  if (!o.revealed && o.picked) return "picked";
  return "rest";
}

/** Bar colour for a state (null = no bar). */
export function feedbackBarColor(state: BoxlessState, colors: { correct: string; wrong: string }): string | null {
  if (state === "correct") return colors.correct;
  if (state === "wrong") return colors.wrong;
  if (state === "picked") return "rgba(255,255,255,0.7)";
  return null;
}

/** Text / mark colour without a box: the stage ink at rest, tinted on reveal. */
export function boxlessTextColor(state: BoxlessState, colors: { rest: string; correct: string; wrong: string }): string {
  return state === "correct" ? colors.correct : state === "wrong" ? colors.wrong : colors.rest;
}

/* ------------------------------------------------------- per-answer colour */

function hexRgb(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** `hex` mixed toward white by `amount` (0–1); non-hex input comes back unchanged. */
export function lighten(hex: string, amount: number): string {
  const rgb = hexRgb(hex);
  if (!rgb) return hex;
  return `#${rgb.map((c) => Math.round(c + (255 - c) * amount).toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Per-answer colour on styled lettering where there is no box to carry it
 * (Hide answer boxes, or an image caption): the colour becomes the lettering's
 * accent — the bottom of the gradient, with a lighter top — while outline,
 * depth, rim and any image fill stay as the preset has them.
 */
export function tintLettering<T extends { palette: [string, string][] }>(style: T, color: string | undefined): T {
  if (!color || !hexRgb(color)) return style;
  return { ...style, palette: [[lighten(color, 0.6), color.toLowerCase()]] };
}
