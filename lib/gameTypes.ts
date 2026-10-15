/**
 * The game question types (schema 11): memory-flip, pop-match, star-collect,
 * drag-match, sequence and timed-reveal.
 *
 * Pure and deterministic. Every animation is a function of a clock in
 * milliseconds (and the question's id), never of Math.random or Date.now, so
 * the builder preview, live play, host mode and the video export all draw the
 * same frame for the same moment. The renderer (lib/videoExport/renderer.ts)
 * and the play pages read from here; nothing in this file touches the DOM.
 *
 * Every game type is built on the ordinary `options` list (text, picture,
 * `correct`, `color`, `icon`), so scoring, streaks, shuffle, text styles,
 * Option.color, themes and the progress header keep working unchanged.
 */

import type { DragHandleKind, GameQuestionKind, GameSettings, GameSpeed, MediaRef, Question } from "../types/quiz.ts";
import { GAME_KIND_LIST } from "../types/quiz.ts";

export function isGameKind(kind: string | undefined): kind is GameQuestionKind {
  return !!kind && (GAME_KIND_LIST as readonly string[]).includes(kind);
}

export const GAME_KIND_LABELS: Record<GameQuestionKind, string> = {
  "memory-flip": "Memory (remember, then flip)",
  "pop-match": "Pop (tap what pops up)",
  "star-collect": "Star or Go",
  "drag-match": "Drag to match",
  sequence: "Put in order",
  "timed-reveal": "Timed reveal",
};

/** Short tag used on the question list and in the stage header. */
export const GAME_KIND_TAGS: Record<GameQuestionKind, string> = {
  "memory-flip": "Memory",
  "pop-match": "Pop",
  "star-collect": "Star/Go",
  "drag-match": "Drag",
  sequence: "Order",
  "timed-reveal": "Timed",
};

/** Header hint, drawn after "Question N of X" like the classic kinds' hints. */
export const GAME_KIND_HINTS: Record<GameQuestionKind, string> = {
  "memory-flip": "remember, then pick",
  "pop-match": "tap what pops up",
  "star-collect": "answer, then star or go",
  "drag-match": "drag it to its match",
  sequence: "tap in order",
  "timed-reveal": "answers appear one by one",
};

/* --------------------------------------------------------------- seeding */

/** FNV-1a: a stable 32-bit hash of a string. */
export function hashString(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: a small seeded generator, 0 <= value < 1. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seededShuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const random = seededRandom(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/* -------------------------------------------------------------- settings */

export const GAME_LIMITS = {
  rememberMs: { min: 1000, max: 15000, def: 3000 },
  popMs: { min: 1200, max: 6000, def: 2600 },
  popCount: { min: 1, max: 5, def: 3 },
  stars: { min: 1, max: 5, def: 3 },
  stepMs: { min: 400, max: 5000, def: 1200 },
} as const;

/** Duration multipliers: Slow stretches every animation, Fast shortens it. */
export const SPEED_FACTOR: Record<GameSpeed, number> = { slow: 1.6, normal: 1, fast: 0.65 };

export const DEFAULT_CARD_BACK = "❓";
export const DEFAULT_DRAG_ITEM = "⭐";
export const DEFAULT_DRAG_HANDLE: DragHandleKind = "stick";

export interface ResolvedGame {
  animate: boolean;
  speed: GameSpeed;
  /** Multiplier for animation durations (1 = normal). 0 never happens: instant states use `dur()`. */
  factor: number;
  rememberMs: number;
  memoryMode: "flip" | "recall";
  cardBack: string;
  popMs: number;
  popCount: number;
  popFrom: "random" | "edges" | "mixed";
  stars: number;
  videoChoice: "star" | "go";
  stepMs: number;
  dragItem: string;
  dragHandle: { kind: DragHandleKind; image?: MediaRef };
}

function clamp(value: number | undefined, min: number, max: number, def: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return def;
  return Math.min(max, Math.max(min, value));
}

/** Settings with every default filled in and every number clamped. Pass the question so `popCount` never exceeds the answers. */
export function resolveGame(question: Pick<Question, "game" | "options">): ResolvedGame {
  const g: GameSettings = question.game ?? {};
  const speed: GameSpeed = g.speed === "slow" || g.speed === "fast" ? g.speed : "normal";
  const n = Math.max(1, question.options.length);
  const handleKind: DragHandleKind = g.dragHandle?.kind === "hand" || g.dragHandle?.kind === "custom" ? g.dragHandle.kind : DEFAULT_DRAG_HANDLE;
  const handle = handleKind === "custom" && !g.dragHandle?.image ? DEFAULT_DRAG_HANDLE : handleKind;
  return {
    animate: g.animate !== false,
    speed,
    factor: SPEED_FACTOR[speed],
    rememberMs: Math.round(clamp(g.rememberMs, GAME_LIMITS.rememberMs.min, GAME_LIMITS.rememberMs.max, GAME_LIMITS.rememberMs.def)),
    memoryMode: g.memoryMode === "recall" ? "recall" : "flip",
    cardBack: g.cardBack?.trim() ? g.cardBack.trim() : DEFAULT_CARD_BACK,
    popMs: Math.round(clamp(g.popMs, GAME_LIMITS.popMs.min, GAME_LIMITS.popMs.max, GAME_LIMITS.popMs.def)),
    popCount: Math.min(n, Math.round(clamp(g.popCount, GAME_LIMITS.popCount.min, GAME_LIMITS.popCount.max, GAME_LIMITS.popCount.def))),
    popFrom: g.popFrom === "edges" || g.popFrom === "mixed" ? g.popFrom : "random",
    stars: Math.round(clamp(g.stars, GAME_LIMITS.stars.min, GAME_LIMITS.stars.max, GAME_LIMITS.stars.def)),
    videoChoice: g.videoChoice === "go" ? "go" : "star",
    stepMs: Math.round(clamp(g.stepMs, GAME_LIMITS.stepMs.min, GAME_LIMITS.stepMs.max, GAME_LIMITS.stepMs.def)),
    dragItem: g.dragItem?.trim() ? g.dragItem.trim() : DEFAULT_DRAG_ITEM,
    dragHandle: handle === "custom" ? { kind: "custom", image: g.dragHandle!.image } : { kind: handle },
  };
}

/** An animation duration under the question's settings: 0 when animation is off. */
export function dur(game: ResolvedGame, ms: number): number {
  return game.animate ? ms * game.factor : 0;
}

/* ---------------------------------------------------------- answer rules */

export type PickMode = "single" | "multi" | "ordered";

/**
 * How picks work on a question. The classic kinds are unchanged: a lone answer
 * and every non-multi kind lock in on the first tap, multi-select waits for
 * Submit. Game kinds follow the data: sequence is ordered, and any other game
 * kind becomes pick-all (with Submit) as soon as more than one answer is
 * ticked correct.
 */
export function pickMode(question: Pick<Question, "kind" | "options">): PickMode {
  if (question.kind === "sequence") return "ordered";
  if (isGameKind(question.kind)) return question.options.filter((o) => o.correct).length > 1 ? "multi" : "single";
  return "single";
}

/** True when a tap toggles a selection instead of locking in (game kinds only; the classic check stays `kind === "multi-select"`). */
export function togglesPicks(question: Pick<Question, "kind" | "options">): boolean {
  return pickMode(question) !== "single";
}

/** The picks that make a sequence correct: the answers in the order they were authored. */
export function sequenceKey(question: Pick<Question, "options">): string[] {
  return question.options.map((o) => o.id);
}

/**
 * Whether the picks are right. Sequence needs every answer, in authored order;
 * everything else needs exactly the ticked set (as before).
 */
export function isAnswerCorrect(question: Pick<Question, "kind" | "options">, selectedIds: string[]): boolean {
  if (question.kind === "sequence") {
    const key = sequenceKey(question);
    return key.length > 0 && key.length === selectedIds.length && key.every((id, i) => selectedIds[i] === id);
  }
  const correct = question.options.filter((o) => o.correct).map((o) => o.id);
  if (!correct.length) return false;
  const picked = new Set(selectedIds);
  return correct.length === picked.size && correct.every((id) => picked.has(id));
}

/** The order answers are shown in. Sequence shows a seeded shuffle that is never the answer; everything else keeps its list order. */
export function displayOptions<T extends { id: string }>(question: Pick<Question, "id" | "kind"> & { options: T[] }): T[] {
  if (question.kind !== "sequence" || question.options.length < 2) return question.options;
  let shuffled = seededShuffle(question.options, hashString(`${question.id}:sequence`));
  if (shuffled.every((o, i) => o.id === question.options[i].id)) shuffled = [...shuffled.slice(1), shuffled[0]];
  return shuffled;
}

/** Selecting in a sequence: tapping a picked answer removes it and every later pick; tapping a new one appends. */
export function toggleSequencePick(selected: string[], optionId: string): string[] {
  const at = selected.indexOf(optionId);
  return at === -1 ? [...selected, optionId] : selected.slice(0, at);
}

/* ---------------------------------------------------------- memory & flip */

export const FLIP_MS = 520;

/** 0..1 progress of a timed animation. */
export function progress(clock: number, start: number, length: number): number {
  if (length <= 0) return clock >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (clock - start) / length));
}

/** A real card flip: width shrinks to a sliver at the half-way point, the face swaps, the width grows back. */
export function flipCard(p: number): { scaleX: number; secondHalf: boolean } {
  const clamped = Math.min(1, Math.max(0, p));
  return { scaleX: Math.max(0.02, Math.abs(Math.cos(clamped * Math.PI))), secondHalf: clamped >= 0.5 };
}

export interface MemoryState {
  phase: "remember" | "play";
  /** Whole milliseconds of the remember phase left. */
  remainingMs: number;
  /** Flip progress of the "turn face down" move, 0..1 (1 when done). */
  flip: number;
  /** Whether the cards currently show their back. */
  faceDown: boolean;
  /** Width scale for the flip, 1 when not flipping. */
  scaleX: number;
}

/** What a memory-flip question looks like `clock` ms after its game clock started. */
export function memoryState(question: Pick<Question, "game" | "options">, clock: number): MemoryState {
  const g = resolveGame(question);
  const flipMs = dur(g, FLIP_MS);
  const p = progress(clock, g.rememberMs, flipMs);
  const after = clock >= g.rememberMs;
  const { scaleX, secondHalf } = flipCard(p);
  return {
    phase: after ? "play" : "remember",
    remainingMs: Math.max(0, g.rememberMs - clock),
    flip: p,
    faceDown: g.memoryMode === "flip" && after && (flipMs === 0 || secondHalf),
    scaleX: g.memoryMode === "flip" && after && p < 1 ? scaleX : 1,
  };
}

/** Milliseconds after the game clock starts before the player may pick (memory-flip's remember phase and flip). */
export function lockedMs(question: Pick<Question, "kind" | "game" | "options">): number {
  if (question.kind === "memory-flip") {
    const g = resolveGame(question);
    return g.rememberMs + (g.memoryMode === "flip" ? dur(g, FLIP_MS) : 0);
  }
  return 0;
}

/** Whether a pick is allowed `clock` ms after the game clock started. Everything but memory-flip is always open. */
export function canPickAt(question: Pick<Question, "kind" | "game" | "options">, clock: number): boolean {
  return clock >= lockedMs(question);
}

/* ------------------------------------------------------------- timed reveal */

/** Entrance progress (0..1) of answer `index` in a timed-reveal question. */
export function timedRevealProgress(question: Pick<Question, "game" | "options">, index: number, clock: number): number {
  const g = resolveGame(question);
  const start = index * g.stepMs;
  return progress(clock, start, dur(g, 420));
}

/** Whether answer `index` of a timed-reveal question is on screen (and so can be picked). */
export function timedRevealShown(question: Pick<Question, "game" | "options">, index: number, clock: number): boolean {
  const g = resolveGame(question);
  return clock >= index * g.stepMs;
}

/* ---------------------------------------------------------------- pop-match */

export const POP_COLS = 4;
export const POP_ROWS = 3;
export type PopEdge = "left" | "right" | "top" | "bottom";

export interface PopAppearance {
  /** Appearance number: 0 is the first item to pop. */
  s: number;
  optionIndex: number;
  start: number;
  end: number;
  /** Centre of the item, as 0..1 of the pop field. */
  x: number;
  y: number;
  /** The edge it flies in from, or null when it pops in place. */
  edge: PopEdge | null;
}

function popCells(from: "random" | "edges", count: number, seedBase: number, group: number): number[] {
  const cells: number[] = [];
  for (let r = 0; r < POP_ROWS; r++) {
    for (let c = 0; c < POP_COLS; c++) {
      const border = r === 0 || r === POP_ROWS - 1 || c === 0 || c === POP_COLS - 1;
      if (from === "random" || border) cells.push(r * POP_COLS + c);
    }
  }
  return seededShuffle(cells, (seedBase ^ Math.imul(group + 1, 0x9e3779b1)) >>> 0).slice(0, Math.max(1, count));
}

/** Item `s` of a pop-match question: which answer, when, where, and from which edge. Pure in (question id, settings, s). */
export function popAppearance(question: Pick<Question, "id" | "game" | "options">, s: number): PopAppearance {
  const g = resolveGame(question);
  const n = Math.max(1, question.options.length);
  const seed = hashString(`${question.id}:pop`);
  const order = seededShuffle(Array.from({ length: n }, (_, i) => i), seed);
  const gap = g.popMs / g.popCount;
  const mode: "random" | "edges" = g.popFrom === "mixed" ? (hashString(`${question.id}:${s}:m`) % 2 ? "edges" : "random") : g.popFrom;
  const group = Math.floor(s / g.popCount);
  const lane = s % g.popCount;
  const cells = popCells(mode, g.popCount, seed, group);
  const cell = cells[lane % cells.length];
  const random = seededRandom(hashString(`${question.id}:${s}:j`));
  const col = cell % POP_COLS;
  const row = Math.floor(cell / POP_COLS);
  const x = (col + 0.5 + (random() - 0.5) * 0.5) / POP_COLS;
  const y = (row + 0.5 + (random() - 0.5) * 0.5) / POP_ROWS;
  let edge: PopEdge | null = null;
  if (mode === "edges") {
    const distances: [PopEdge, number][] = [["left", x], ["right", 1 - x], ["top", y], ["bottom", 1 - y]];
    edge = distances.sort((a, b) => a[1] - b[1])[0][0];
  }
  return { s, optionIndex: order[s % n], start: s * gap, end: s * gap + g.popMs, x, y, edge };
}

/** Every pop-match item on screen at `clock`, oldest first. */
export function popVisible(question: Pick<Question, "id" | "game" | "options">, clock: number): PopAppearance[] {
  if (clock < 0) return [];
  const g = resolveGame(question);
  const gap = g.popMs / g.popCount;
  const newest = Math.floor(clock / gap);
  const out: PopAppearance[] = [];
  for (let s = Math.max(0, newest - g.popCount - 1); s <= newest; s++) {
    const a = popAppearance(question, s);
    if (clock >= a.start && clock < a.end) out.push(a);
  }
  return out;
}

export const POP_IN_MS = 380;
export const POP_OUT_MS = 260;

/** Scale 0..1 (with a little overshoot on the way in) and slide progress 0..1 for a visible item. */
export function popPose(question: Pick<Question, "game" | "options">, a: PopAppearance, clock: number): { scale: number; slide: number } {
  const g = resolveGame(question);
  const inMs = dur(g, POP_IN_MS);
  const outMs = dur(g, POP_OUT_MS);
  const pin = progress(clock, a.start, inMs);
  const pout = outMs === 0 ? 0 : progress(clock, a.end - outMs, outMs);
  // easeOutBack for the entrance, so items really "pop".
  const c1 = 1.70158;
  const back = 1 + (c1 + 1) * Math.pow(pin - 1, 3) + c1 * Math.pow(pin - 1, 2);
  return { scale: Math.max(0, back) * (1 - pout), slide: 1 - Math.pow(1 - pin, 3) };
}

/**
 * When a simulated player taps `optionId`: the middle of one of its pops,
 * as late as possible but not after `atMost` (and not before `atLeast`).
 */
export function popTapTime(question: Pick<Question, "id" | "game" | "options">, optionId: string, atMost: number, atLeast = 0): number {
  const g = resolveGame(question);
  const index = question.options.findIndex((o) => o.id === optionId);
  const gap = g.popMs / g.popCount;
  let best: number | null = null;
  let first: number | null = null;
  const cycles = Math.ceil((atMost + g.popMs) / gap) + question.options.length;
  for (let s = 0; s <= cycles; s++) {
    const a = popAppearance(question, s);
    if (a.optionIndex !== index) continue;
    const mid = a.start + g.popMs * 0.5;
    if (first === null) first = mid;
    if (mid <= atMost && mid >= atLeast) best = mid;
    if (mid > atMost) break;
  }
  return best ?? first ?? atLeast;
}

/* --------------------------------------------------------------- drag-match */

export const DRAG_MS = 1100;

/** The dragged item's position `p` (0..1) of the way from `from` to `to`: eased, with a small lift so it arcs. */
export function dragPoint(from: { x: number; y: number }, to: { x: number; y: number }, p: number, lift = 0.12): { x: number; y: number; lifted: number } {
  const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  const arc = Math.sin(Math.PI * e) * lift * Math.hypot(to.x - from.x, to.y - from.y);
  return { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e - arc, lifted: Math.sin(Math.PI * Math.min(1, p)) };
}

/** Where each default handle's pointing tip sits in its picture, as 0..1 of width and height. */
export const HANDLE_HOTSPOTS: Record<"stick" | "hand" | "hand-grab" | "custom", { x: number; y: number }> = {
  stick: { x: 0.12, y: 0.9 },
  hand: { x: 0.36, y: 0.08 },
  "hand-grab": { x: 0.45, y: 0.32 },
  custom: { x: 0.5, y: 0.5 },
};

/** Same-origin transparent SVGs shipped in /public/drag-handles. */
export const HANDLE_ASSETS: Record<"stick" | "hand" | "hand-grab", MediaRef> = {
  stick: { kind: "url", url: "/drag-handles/stick.svg", alt: "Stick" },
  hand: { kind: "url", url: "/drag-handles/hand.svg", alt: "Hand" },
  "hand-grab": { kind: "url", url: "/drag-handles/hand-grab.svg", alt: "Hand grabbing" },
};

/** Pictures a drag-match question needs loaded for its handle (the defaults, or the custom upload). */
export function dragHandleRefs(question: Pick<Question, "kind" | "game" | "options">): MediaRef[] {
  if (question.kind !== "drag-match") return [];
  const g = resolveGame(question);
  if (g.dragHandle.kind === "custom" && g.dragHandle.image) return [g.dragHandle.image];
  if (g.dragHandle.kind === "hand") return [HANDLE_ASSETS.hand, HANDLE_ASSETS["hand-grab"]];
  return [HANDLE_ASSETS.stick];
}

/**
 * The handle's pose while it follows the pointer: tilt (degrees) swings with
 * horizontal speed, `squash` pulses while dragging, `bob` is a gentle idle
 * wiggle. `t` is milliseconds and only drives the idle/drag wobble.
 */
export function handlePose(kind: DragHandleKind, dragging: boolean, vx: number, t: number): { rotate: number; scale: number; bob: number } {
  const wobble = Math.sin(t / (dragging ? 90 : 420));
  if (!dragging) return { rotate: wobble * (kind === "stick" ? 6 : 4), scale: 1, bob: Math.sin(t / 380) * 3 };
  const swing = Math.max(-1, Math.min(1, vx / 900));
  return { rotate: swing * 22 + wobble * (kind === "stick" ? 5 : 3), scale: kind === "hand" ? 0.94 : 1 + wobble * 0.04, bob: 0 };
}
