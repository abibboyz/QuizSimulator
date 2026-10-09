/**
 * How a celebration picture is cut apart and put back together.
 *
 * Play, host, preview, and the video export all read this. A piece is a
 * silhouette of the chosen shape (a butterfly, a bubble, a star, …) holding
 * its own part of the picture. The silhouettes fly in, then each one opens
 * out to its rectangle so the picture is whole again.
 */

import { PHOTO_ASSEMBLY_ANIMATIONS, celebrationPieceCount } from "./celebration.ts";

export type PhotoAssemblyStyle = (typeof PHOTO_ASSEMBLY_ANIMATIONS)[number];

export interface Point {
  x: number;
  y: number;
}

export interface FlightSample {
  /** Offset as a fraction of the frame width. */
  x: number;
  /** Offset as a fraction of the frame height. */
  y: number;
  scale: number;
  /** Degrees, clockwise. */
  rotate: number;
}

export interface AssemblyPiece {
  index: number;
  /** Signature silhouette, in frame space (0–1). */
  shape: Point[];
  /** The rectangle (or wedge, or strip) this piece owns. Same point count as `shape`. */
  cover: Point[];
  flight: [FlightSample, FlightSample, FlightSample, FlightSample];
}

export interface AssemblyPose extends FlightSample {
  /** 0 = silhouette, 1 = the piece's cover, so neighbouring pieces meet. */
  morph: number;
  opacity: number;
}

const POINTS = 24;
const FLIGHT_TIMES = [0, 0.34, 0.72, 1];

export function isPhotoAssemblyStyle(animation: string): animation is PhotoAssemblyStyle {
  return (PHOTO_ASSEMBLY_ANIMATIONS as readonly string[]).includes(animation);
}

export function assemblyPieces(style: PhotoAssemblyStyle, count: number | undefined): AssemblyPiece[] {
  const total = celebrationPieceCount(count);
  return Array.from({ length: total }, (_, index) => {
    const coverSource = coverOf(style, index, total);
    const shapeSource = shapeOf(style, index, total);
    const cover = resample(coverSource, POINTS);
    const shape = resample(shapeSource, POINTS);
    return { index, shape, cover, flight: flightOf(style, index, total) };
  });
}

/** CSS `clip-path` for a polygon in frame space. */
export function polygonPath(points: Point[]): string {
  return `polygon(${points.map((point) => `${round(point.x * 100)}% ${round(point.y * 100)}%`).join(", ")})`;
}

export function morphedPoints(piece: AssemblyPiece, morph: number): Point[] {
  const t = clamp01(morph);
  if (t === 0) return piece.shape;
  if (t === 1) return piece.cover;
  return piece.shape.map((point, index) => ({
    x: point.x + (piece.cover[index].x - point.x) * t,
    y: point.y + (piece.cover[index].y - point.y) * t,
  }));
}

/**
 * Stagger matching the on-screen pieces: the first starts immediately, the
 * last waits a fifth of the entrance (at most 0.7s), and each flight is long
 * enough to read.
 */
export function pieceWindow(index: number, count: number, durationMs: number): { delay: number; span: number } {
  const maxDelay = Math.min(700, Math.max(0, durationMs) * 0.2);
  const delay = count <= 1 ? 0 : (index / (count - 1)) * maxDelay;
  const span = Math.max(600, durationMs - maxDelay);
  return { delay, span };
}

export function pieceProgress(sinceMs: number, index: number, count: number, durationMs: number): number {
  const { delay, span } = pieceWindow(index, count, durationMs);
  return clamp01((sinceMs - delay) / span);
}

/** Where one piece is at `t` (0 at the start of its own flight, 1 when it has joined). */
export function poseAt(piece: AssemblyPiece, t: number): AssemblyPose {
  const p = clamp01(t);
  const flight = sampleFlight(piece.flight, p);
  const morph = p <= 0.72 ? 0 : clamp01((p - 0.72) / 0.22);
  let opacity = 1;
  if (p < 0.34) opacity = p / 0.34;
  else if (p > 0.88) opacity = clamp01((1 - p) / 0.12);
  return { ...flight, morph, opacity };
}

export function motionFrames(piece: AssemblyPiece): {
  x: string[];
  y: string[];
  scale: number[];
  rotate: number[];
  clipPath: string[];
  times: number[];
} {
  return {
    x: piece.flight.map((sample) => `${round(sample.x * 100)}%`),
    y: piece.flight.map((sample) => `${round(sample.y * 100)}%`),
    scale: piece.flight.map((sample) => sample.scale),
    rotate: piece.flight.map((sample) => sample.rotate),
    clipPath: [polygonPath(piece.shape), polygonPath(piece.shape), polygonPath(piece.shape), polygonPath(piece.cover)],
    times: FLIGHT_TIMES,
  };
}

/* ----------------------------------------------------------------- layout */

interface Cell {
  x: number;
  y: number;
  w: number;
  h: number;
}

function grid(count: number): { columns: number; rows: number } {
  const columns = Math.ceil(Math.sqrt(count));
  return { columns, rows: Math.ceil(count / columns) };
}

function cellOf(index: number, count: number): Cell {
  const { columns, rows } = grid(count);
  const col = index % columns;
  const row = Math.floor(index / columns);
  return { x: col / columns, y: row / rows, w: 1 / columns, h: 1 / rows };
}

function coverOf(style: PhotoAssemblyStyle, index: number, count: number): Point[] {
  if (style === "curtain-assemble") {
    return rectPoints({ x: index / count, y: 0, w: 1 / count, h: 1 });
  }
  if (style === "spiral-assemble") return wedge(index, count);
  return rectPoints(cellOf(index, count));
}

function shapeOf(style: PhotoAssemblyStyle, index: number, count: number): Point[] {
  if (style === "curtain-assemble" || style === "mosaic-assemble" || style === "flip-assemble" || style === "zoom-assemble") {
    return coverOf(style, index, count);
  }
  if (style === "spiral-assemble") return wedge(index, count);
  const local = style === "butterfly"
    ? butterfly()
    : style === "bubbles"
      ? circle(0.46)
      : style === "stars"
        ? star()
        : shard(index);
  return local.map((point) => {
    const cell = cellOf(index, count);
    return { x: cell.x + point.x * cell.w, y: cell.y + point.y * cell.h };
  });
}

function flightOf(style: PhotoAssemblyStyle, index: number, count: number): AssemblyPiece["flight"] {
  const { columns, rows } = grid(count);
  const col = index % columns;
  const row = Math.floor(index / columns);
  const side = col + 0.5 < columns / 2 ? -1 : 1;
  const sway = index % 2 === 0 ? -1 : 1;
  const angle = (index / count) * Math.PI * 2;
  const home: FlightSample = { x: 0, y: 0, scale: 1, rotate: 0 };

  if (style === "butterfly") {
    return [
      { x: side * (1.45 + row * 0.22), y: Math.sin(index * 1.7) * 0.95, scale: 0.42, rotate: side * 32 },
      { x: side * 0.95 + sway * 0.38, y: Math.sin(index * 1.7) * 0.4 - 0.28, scale: 0.62, rotate: -side * 18 },
      { x: side * 0.32 + sway * 0.12, y: Math.sin(index) * 0.14, scale: 0.86, rotate: side * 8 },
      home,
    ];
  }
  if (style === "bubbles") {
    return [
      { x: (col - (columns - 1) / 2) * 0.22, y: 1.55 + row * 0.12, scale: 0.28, rotate: 0 },
      { x: sway * 0.28, y: 0.55 - row * 0.08, scale: 0.7, rotate: sway * 10 },
      { x: sway * 0.08, y: -0.06, scale: 1.06, rotate: 0 },
      home,
    ];
  }
  if (style === "stars") {
    return [
      { x: Math.cos(angle) * 1.35, y: -1.25 - (index % 3) * 0.15, scale: 0.3, rotate: index * 28 },
      { x: Math.cos(angle) * 0.55, y: -0.45, scale: 0.6, rotate: index * 12 },
      { x: Math.cos(angle) * 0.12, y: -0.08, scale: 0.9, rotate: -8 },
      home,
    ];
  }
  if (style === "spiral-assemble") {
    return [
      { x: Math.cos(angle) * 1.5, y: Math.sin(angle) * 1.35, scale: 0.35, rotate: index * 70 },
      { x: Math.cos(angle + 1.2) * 0.85, y: Math.sin(angle + 1.2) * 0.75, scale: 0.6, rotate: index * 36 },
      { x: Math.cos(angle + 2.1) * 0.28, y: Math.sin(angle + 2.1) * 0.24, scale: 0.86, rotate: 20 },
      home,
    ];
  }
  if (style === "curtain-assemble") {
    const from = index % 2 === 0 ? -1.35 : 1.35;
    return [
      { x: 0, y: from, scale: 1, rotate: 0 },
      { x: sway * 0.08, y: from * 0.35, scale: 1, rotate: sway * 6 },
      { x: 0, y: from * 0.08, scale: 1, rotate: 0 },
      home,
    ];
  }
  if (style === "flip-assemble") {
    return [
      { x: (col - (columns - 1) / 2) * 0.18, y: (row - (rows - 1) / 2) * 0.16, scale: 0.86, rotate: side * 78 },
      { x: side * 0.12, y: -0.12, scale: 0.94, rotate: -side * 28 },
      { x: 0, y: 0, scale: 1, rotate: side * 8 },
      home,
    ];
  }
  if (style === "zoom-assemble") {
    return [
      { x: (col - (columns - 1) / 2) * 0.35, y: (row - (rows - 1) / 2) * 0.28, scale: 2.4, rotate: 0 },
      { x: (col - (columns - 1) / 2) * 0.12, y: (row - (rows - 1) / 2) * 0.1, scale: 1.45, rotate: sway * 6 },
      { x: 0, y: 0, scale: 0.94, rotate: 0 },
      home,
    ];
  }
  // Glass shards and mosaic tiles scatter, then settle.
  return [
    { x: Math.cos(angle) * (style === "glass-assemble" ? 1.25 : 0.9), y: Math.sin(angle) * (style === "glass-assemble" ? 1.05 : 0.85), scale: style === "glass-assemble" ? 0.72 : 0.55, rotate: index * (style === "glass-assemble" ? 40 : 16) },
    { x: Math.cos(angle) * 0.45, y: Math.sin(angle) * 0.38, scale: 0.84, rotate: index * 12 },
    { x: Math.cos(angle) * 0.1, y: Math.sin(angle) * 0.08, scale: 0.96, rotate: 4 },
    home,
  ];
}

/* ------------------------------------------------------------------ shapes */

/** Wings spread, body down the middle. Unit square, head at the top. */
function butterfly(): Point[] {
  return [
    { x: 0.5, y: 0.05 },
    { x: 0.43, y: 0.13 },
    { x: 0.24, y: 0.04 },
    { x: 0.05, y: 0.18 },
    { x: 0.07, y: 0.36 },
    { x: 0.2, y: 0.4 },
    { x: 0.04, y: 0.58 },
    { x: 0.1, y: 0.8 },
    { x: 0.3, y: 0.72 },
    { x: 0.42, y: 0.5 },
    { x: 0.47, y: 0.96 },
    { x: 0.53, y: 0.96 },
    { x: 0.58, y: 0.5 },
    { x: 0.7, y: 0.72 },
    { x: 0.9, y: 0.8 },
    { x: 0.96, y: 0.58 },
    { x: 0.8, y: 0.4 },
    { x: 0.93, y: 0.36 },
    { x: 0.95, y: 0.18 },
    { x: 0.76, y: 0.04 },
    { x: 0.57, y: 0.13 },
  ];
}

function circle(radius: number): Point[] {
  return Array.from({ length: 16 }, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return { x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius };
  });
}

function star(): Point[] {
  return Array.from({ length: 10 }, (_, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI) / 5;
    const radius = index % 2 === 0 ? 0.48 : 0.2;
    return { x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius };
  });
}

/** A jagged shard. The index only changes the silhouette, never the cell it belongs to. */
function shard(index: number): Point[] {
  const turn = ((index * 47) % 360) * (Math.PI / 180);
  return [0, 1.4, 2.6, 3.7, 5].map((step, vertex) => {
    const radius = vertex % 2 === 0 ? 0.48 : 0.3;
    const angle = turn + step;
    return {
      x: clamp01(0.5 + Math.cos(angle) * radius),
      y: clamp01(0.5 + Math.sin(angle) * radius),
    };
  });
}

function wedge(index: number, count: number): Point[] {
  const start = (index / count) * Math.PI * 2 - Math.PI / 2;
  const end = ((index + 1) / count) * Math.PI * 2 - Math.PI / 2;
  // 0.75 from the centre reaches past every corner of the frame (the corner is ~0.707).
  const radius = 0.75;
  const points: Point[] = [{ x: 0.5, y: 0.5 }];
  for (let step = 0; step <= 8; step += 1) {
    const angle = start + (end - start) * (step / 8);
    points.push({ x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius });
  }
  return points;
}

function rectPoints(cell: Cell): Point[] {
  return [
    { x: cell.x, y: cell.y },
    { x: cell.x + cell.w, y: cell.y },
    { x: cell.x + cell.w, y: cell.y + cell.h },
    { x: cell.x, y: cell.y + cell.h },
  ];
}

function resample(points: Point[], count: number): Point[] {
  const closed = [...points, points[0]];
  const lengths: number[] = [];
  let total = 0;
  for (let index = 0; index < closed.length - 1; index += 1) {
    const length = Math.hypot(closed[index + 1].x - closed[index].x, closed[index + 1].y - closed[index].y);
    lengths.push(length);
    total += length;
  }
  if (total === 0) return Array.from({ length: count }, () => ({ ...points[0] }));
  const out: Point[] = [];
  for (let index = 0; index < count; index += 1) {
    let distance = (index / count) * total;
    for (let edge = 0; edge < lengths.length; edge += 1) {
      if (distance <= lengths[edge] || edge === lengths.length - 1) {
        const fraction = lengths[edge] === 0 ? 0 : distance / lengths[edge];
        out.push({
          x: closed[edge].x + (closed[edge + 1].x - closed[edge].x) * fraction,
          y: closed[edge].y + (closed[edge + 1].y - closed[edge].y) * fraction,
        });
        break;
      }
      distance -= lengths[edge];
    }
  }
  return out;
}

function sampleFlight(samples: AssemblyPiece["flight"], t: number): FlightSample {
  for (let index = 0; index < FLIGHT_TIMES.length - 1; index += 1) {
    const start = FLIGHT_TIMES[index];
    const end = FLIGHT_TIMES[index + 1];
    if (t <= end || index === FLIGHT_TIMES.length - 2) {
      const fraction = end === start ? 1 : clamp01((t - start) / (end - start));
      const from = samples[index];
      const to = samples[index + 1];
      return {
        x: from.x + (to.x - from.x) * fraction,
        y: from.y + (to.y - from.y) * fraction,
        scale: from.scale + (to.scale - from.scale) * fraction,
        rotate: from.rotate + (to.rotate - from.rotate) * fraction,
      };
    }
  }
  return samples[samples.length - 1];
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
