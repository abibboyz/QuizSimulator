import type { Question } from "../types/quiz.ts";
import { promptGraphemes } from "./promptText.ts";

export type PromptStyle = NonNullable<Question["promptStyle"]>;
export type PromptTextAnimation = NonNullable<PromptStyle["textAnimation"]>;

export function promptParagraphLines(text: string, shape: NonNullable<PromptStyle["paragraphShape"]>, maxChars: number): { text: string; start: number; end: number }[] {
  const limit = Math.max(4, Math.floor(maxChars));
  const estimate = Math.max(1, Math.ceil(promptGraphemes(text).length / limit));
  const lines: { text: string; start: number; end: number }[] = [];
  let start = 0;
  for (const paragraph of text.split("\n")) {
    const words = paragraph.match(/\S+\s*|\s+/gu) ?? [];
    let line = "";
    const flush = () => {
      const end = start + promptGraphemes(line).length;
      lines.push({ text: line.trimEnd(), start, end });
      start = end;
      line = "";
    };
    for (const word of words) {
      const row = lines.length;
      const position = estimate <= 1 ? 0.5 : row / (estimate - 1);
      const contour = shape === "diamond" ? 0.55 + 0.45 * (1 - Math.abs(2 * position - 1))
        : shape === "oval" ? 0.72 + 0.28 * Math.sqrt(Math.max(0, 1 - (2 * position - 1) ** 2))
        : shape === "narrow" ? 0.7 : 1;
      const lineLimit = Math.max(4, Math.floor(limit * contour));
      if (line && promptGraphemes(line + word).length > lineLimit) flush();
      line += word;
    }
    if (line || !words.length) flush();
    start += 1;
  }
  return lines;
}

export function promptSegments(text: string, unit: PromptTextAnimation["unit"]): { text: string; start: number; end: number }[] {
  const pieces = unit === "sentence" && typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "sentence" }).segment(text)].map((segment) => segment.segment)
    : unit === "word" ? text.match(/\S+\s*|\s+/gu) ?? []
      : unit === "paragraph" ? text.match(/[^\n]+(?:\n+|$)|\n+/gu) ?? []
        : unit === "sentence" ? text.match(/[^.!?\n]+[.!?]*\s*|\n+/gu) ?? []
          : text ? [text] : [];
  let start = 0;
  return pieces.map((piece) => {
    const end = start + promptGraphemes(piece).length;
    const segment = { text: piece, start, end };
    start = end;
    return segment;
  });
}

export function promptAnimationActiveSpan(text: string, animation: PromptTextAnimation): number {
  const count = promptSegments(text, animation.unit).length;
  return Math.max(0, animation.delayMs) + Math.max(0, count - 1) * Math.max(0, animation.staggerMs) + Math.max(1, animation.durationMs);
}

/** A short hold makes a repeated animation readable before its next pass. */
export function promptAnimationSpan(text: string, animation: PromptTextAnimation): number {
  return promptAnimationActiveSpan(text, animation) + Math.max(300, Math.min(800, animation.durationMs));
}

export function promptAnimationElapsed(text: string, animation: PromptTextAnimation, elapsed: number): number {
  const cycle = promptAnimationSpan(text, animation);
  const active = promptAnimationActiveSpan(text, animation);
  if (!Number.isFinite(elapsed)) return active;
  const repeats = animation.repeat === null ? null : Math.max(1, Math.floor(animation.repeat ?? 1));
  if (repeats !== null && elapsed >= cycle * repeats) return active;
  return Math.min(active, Math.max(0, elapsed) % cycle);
}

export function promptSegmentProgress(animation: PromptTextAnimation, index: number, elapsed: number): number {
  const start = Math.max(0, animation.delayMs) + index * Math.max(0, animation.staggerMs);
  return Math.max(0, Math.min(1, (elapsed - start) / Math.max(1, animation.durationMs)));
}

export function promptSegmentPose(effect: PromptTextAnimation["effect"], progress: number, fontSize = 30): { opacity: number; x: number; y: number; scale: number; rotateX: number } {
  const p = Math.max(0, Math.min(1, progress));
  if (effect === "appear") return { opacity: p > 0 ? 1 : 0, x: 0, y: 0, scale: 1, rotateX: 0 };
  const eased = 1 - (1 - p) ** 3;
  const bounce = Math.sin(Math.PI * p) ** 2;
  return {
    opacity: effect === "bounce" || effect === "float" || effect === "pulse" ? 1 : eased,
    x: effect === "slide-left" ? fontSize * 0.7 * (1 - eased) : effect === "slide-right" ? -fontSize * 0.7 * (1 - eased) : 0,
    y: effect === "rise" ? fontSize * 0.35 * (1 - eased) : effect === "drop" ? -fontSize * 0.35 * (1 - eased)
      : effect === "bounce" ? -fontSize * 0.28 * bounce : effect === "float" ? -fontSize * 0.16 * bounce : 0,
    scale: effect === "pop" ? 0.9 + 0.1 * eased : effect === "zoom" ? 0.84 + 0.16 * eased
      : effect === "bounce" ? 1 + 0.035 * bounce : effect === "pulse" ? 1 + 0.1 * bounce : 1,
    rotateX: effect === "flip" ? 55 * (1 - eased) : 0,
  };
}

export function promptPathPose(shape: NonNullable<PromptStyle["textShape"]>, at: number, width: number, fontSize: number, curve = 50): { x: number; y: number; angle: number } {
  const p = Math.max(0, Math.min(1, at));
  const strength = Math.max(0, Math.min(100, curve)) / 100;
  const x = p * width;
  if (shape === "arc-up" || shape === "arc-down") {
    const direction = shape === "arc-up" ? -1 : 1;
    const amplitude = fontSize * 1.5 * strength;
    return { x, y: direction * amplitude * (1 - (2 * p - 1) ** 2), angle: Math.atan(direction * amplitude * 4 * (2 * p - 1) / width) };
  }
  if (shape === "wave") {
    const amplitude = fontSize * 0.55 * strength;
    return { x, y: amplitude * Math.sin(2 * Math.PI * p), angle: Math.atan((2 * Math.PI * amplitude / width) * Math.cos(2 * Math.PI * p)) };
  }
  if (shape === "s-curve") {
    const amplitude = fontSize * strength;
    return { x, y: amplitude * Math.sin(Math.PI * (2 * p - 1)), angle: Math.atan((2 * Math.PI * amplitude / width) * Math.cos(Math.PI * (2 * p - 1))) };
  }
  if (shape === "zigzag") {
    const phase = p * 4;
    const triangle = 1 - 2 * Math.abs((phase % 2) - 1);
    return { x, y: fontSize * strength * triangle, angle: Math.atan((phase % 2 < 1 ? 4 : -4) * fontSize * strength / width) };
  }
  if (shape === "spiral") {
    const angle = -Math.PI / 2 + p * Math.PI * 3;
    const radius = fontSize * (0.5 + 1.7 * p * strength);
    return { x: width / 2 + radius * Math.cos(angle), y: fontSize * 2 + radius * Math.sin(angle), angle: angle + Math.PI / 2 };
  }
  if (shape === "circle") {
    const angle = -Math.PI / 2 + p * Math.PI * 2;
    const radius = Math.max(fontSize, width / (2 * Math.PI));
    return { x: width / 2 + radius * Math.cos(angle), y: radius + radius * Math.sin(angle), angle: angle + Math.PI / 2 };
  }
  return { x, y: 0, angle: 0 };
}
