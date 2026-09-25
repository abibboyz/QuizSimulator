/**
 * Just enough of CSS/Motion's animation maths to evaluate an animation at an
 * arbitrary timestamp: cubic-bézier easing and keyframe interpolation with a
 * per-segment ease, which is how both CSS @keyframes and Motion's `ease`
 * option apply a timing function.
 */

import type { CubicBezier } from "@/lib/playTiming";

export function cubicBezier([x1, y1, x2, y2]: CubicBezier): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sampleY = (t: number) => ((ay * t + by) * t + cy) * t;
  const slopeX = (t: number) => (3 * ax * t + 2 * bx) * t + cx;

  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    // Newton first, bisection if the slope is too flat to trust.
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sampleX(t) - x;
      if (Math.abs(err) < 1e-6) return sampleY(t);
      const d = slopeX(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 30; i++) {
      const v = sampleX(t);
      if (Math.abs(v - x) < 1e-6) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sampleY(t);
  };
}

/** CSS `ease-in-out` / Motion "easeInOut". */
export const easeInOut = cubicBezier([0.42, 0, 0.58, 1]);
/** CSS `ease-out` / Motion "easeOut". */
export const easeOut = cubicBezier([0, 0, 0.58, 1]);
/** CSS `ease-in` / Motion "easeIn". */
export const easeIn = cubicBezier([0.42, 0, 1, 1]);
/** CSS `ease` — the default for a transition with no timing function. */
export const ease = cubicBezier([0.25, 0.1, 0.25, 1]);
/** Tailwind's default `transition` timing function. */
export const tailwindEase = cubicBezier([0.4, 0, 0.2, 1]);
/** `ease-out` cubic used by useAnimatedNumber. */
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3);

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Value of a keyframed number at progress p (0–1). `times` defaults to evenly
 * spaced, like both CSS percentages and Motion keyframes.
 */
export function keyframes(
  values: number[],
  p: number,
  easing: (t: number) => number = (t) => t,
  times?: number[],
): number {
  const n = values.length;
  if (n === 1) return values[0];
  const at = times ?? values.map((_, i) => i / (n - 1));
  const x = clamp01(p);
  for (let i = 0; i < n - 1; i++) {
    const a = at[i] ?? i / (n - 1);
    const b = at[i + 1] ?? (i + 1) / (n - 1);
    if (x <= b || i === n - 2) {
      const span = b - a;
      const local = span > 0 ? clamp01((x - a) / span) : 1;
      return lerp(values[i], values[i + 1], easing(local));
    }
  }
  return values[n - 1];
}

/* ------------------------------------------------------------------ colour */

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

const HEX6 = /^#?([0-9a-f]{6})$/i;
const HEX3 = /^#?([0-9a-f]{3})$/i;
const RGBA = /^rgba?\(([^)]+)\)$/i;

/** Parses #rgb, #rrggbb, rgb() and rgba(). Anything else comes back as opaque black. */
export function parseColor(input: string): Rgba {
  const value = input.trim();
  let m = HEX6.exec(value);
  if (m) {
    const int = parseInt(m[1], 16);
    return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255, a: 1 };
  }
  m = HEX3.exec(value);
  if (m) {
    const [r, g, b] = m[1].split("").map((c) => parseInt(c + c, 16));
    return { r, g, b, a: 1 };
  }
  m = RGBA.exec(value);
  if (m) {
    const parts = m[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map(Number);
    return { r: parts[0] ?? 0, g: parts[1] ?? 0, b: parts[2] ?? 0, a: parts[3] ?? 1 };
  }
  return { r: 0, g: 0, b: 0, a: 1 };
}

export function mixColor(from: string, to: string, t: number): string {
  if (t <= 0) return from;
  if (t >= 1) return to;
  const a = parseColor(from);
  const b = parseColor(to);
  return rgbaString({ r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t), a: lerp(a.a, b.a, t) });
}

/** CSS `saturate(amount)` on a single colour. */
export function saturateColor(input: string, amount: number): string {
  if (amount >= 1) return input;
  const { r, g, b, a } = parseColor(input);
  // The filter spec's saturate matrix.
  const s = amount;
  const nr = (0.213 + 0.787 * s) * r + (0.715 - 0.715 * s) * g + (0.072 - 0.072 * s) * b;
  const ng = (0.213 - 0.213 * s) * r + (0.715 + 0.285 * s) * g + (0.072 - 0.072 * s) * b;
  const nb = (0.213 - 0.213 * s) * r + (0.715 - 0.715 * s) * g + (0.072 + 0.928 * s) * b;
  return rgbaString({ r: nr, g: ng, b: nb, a });
}

export function rgbaString({ r, g, b, a }: Rgba): string {
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return `rgba(${c(r)}, ${c(g)}, ${c(b)}, ${Math.min(1, Math.max(0, a))})`;
}

export function alpha(input: string, a: number): string {
  const c = parseColor(input);
  return rgbaString({ ...c, a: c.a * a });
}

/* -------------------------------------------------------------------- prng */

/** Small seeded PRNG so particles and confetti come out the same every export. */
export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
