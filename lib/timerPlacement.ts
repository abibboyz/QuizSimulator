import type { Question, QuizSettings, TimerPlacement } from "../types/quiz.ts";

export type TimerView = "web" | "mobile";

/** Original timer length is 1. The end point can stretch it, or shrink it a little. */
export const TIMER_SCALE_MIN = 0.5;
export const TIMER_SCALE_MAX = 8;

/** 0–100. A non-number fails safe at the start of the frame. */
export function timerPercent(value: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
}

/** 1 keeps the original timer. Anything else is a length chosen by dragging the end. */
export function timerScale(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.min(TIMER_SCALE_MAX, Math.max(TIMER_SCALE_MIN, value));
}

/**
 * Length that puts the timer's right edge on `edgeX` without leaving the frame.
 * `baseW` and `baseH` are the timer at scale 1, in the same pixels as the frame.
 */
export function timerScaleForEdge(
  edgeX: number,
  originX: number,
  originY: number,
  baseW: number,
  baseH: number,
  frameW: number,
  frameH: number,
): number {
  if (!(baseW > 0)) return 1;
  const grown = (edgeX - originX) / baseW;
  const maxW = frameW > originX ? (frameW - originX) / baseW : TIMER_SCALE_MIN;
  const maxH = baseH > 0 && frameH > originY ? (frameH - originY) / baseH : TIMER_SCALE_MAX;
  return timerScale(Math.min(grown, maxW, maxH));
}

function placedTimer(point: TimerPlacement | undefined): TimerPlacement | undefined {
  if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return undefined;
  const scale = timerScale(point.scale);
  const next: TimerPlacement = { x: timerPercent(point.x), y: timerPercent(point.y) };
  if (scale !== 1) next.scale = scale;
  return next;
}

/**
 * The saved spot for this view, or null when the timer has never been dragged
 * and should stay in the header.
 */
export function timerPlacementFor(
  settings: Pick<QuizSettings, "timerPlacement"> | null | undefined,
  view: TimerView,
  question?: Pick<Question, "timerPlacement">,
): TimerPlacement | null {
  return placedTimer(question?.timerPlacement?.[view]) ?? placedTimer(settings?.timerPlacement?.[view]) ?? null;
}

/**
 * Top-left percent that keeps a box of `timerW`×`timerH` inside the frame.
 * A frame smaller than the timer pins the timer to the origin.
 */
export function clampTimerOrigin(
  xPercent: number,
  yPercent: number,
  timerW: number,
  timerH: number,
  frameW: number,
  frameH: number,
): TimerPlacement {
  const maxX = frameW > timerW ? ((frameW - timerW) / frameW) * 100 : 0;
  const maxY = frameH > timerH ? ((frameH - timerH) / frameH) * 100 : 0;
  return {
    x: Math.min(maxX, Math.max(0, timerPercent(xPercent))),
    y: Math.min(maxY, Math.max(0, timerPercent(yPercent))),
  };
}

/** Writes one view and drops the field entirely when both views are cleared. */
export function withTimerPlacement(
  current: QuizSettings["timerPlacement"],
  view: TimerView,
  point: TimerPlacement | null,
): QuizSettings["timerPlacement"] {
  const next: { web?: TimerPlacement; mobile?: TimerPlacement } = {};
  if (view !== "web") {
    const web = placedTimer(current?.web);
    if (web) next.web = web;
  }
  if (view !== "mobile") {
    const mobile = placedTimer(current?.mobile);
    if (mobile) next.mobile = mobile;
  }
  const written = placedTimer(point ?? undefined);
  if (written) next[view] = written;
  return next.web || next.mobile ? next : undefined;
}
