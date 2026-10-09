import { test } from "node:test";
import assert from "node:assert/strict";
import { PHOTO_ASSEMBLY_ANIMATIONS } from "./celebration.ts";
import { assemblyPieces, morphedPoints, pieceProgress, poseAt, type PhotoAssemblyStyle } from "./photoAssembly.ts";

test("every assembly style cuts the frame into the requested number of pieces", () => {
  for (const style of PHOTO_ASSEMBLY_ANIMATIONS) {
    const pieces = assemblyPieces(style, 9);
    assert.equal(pieces.length, 9, style);
    assert.equal(pieces[0].shape.length, pieces[0].cover.length);
    assert.equal(poseAt(pieces[0], 1).opacity, 0);
    const settled = poseAt(pieces[4], 1);
    assert.equal(settled.x, 0);
    assert.equal(settled.y, 0);
    assert.equal(settled.scale, 1);
    assert.equal(settled.rotate, 0);
    assert.equal(settled.morph, 1);
  }
});

test("a butterfly piece is a winged silhouette of its own cell, and it flies in from the side", () => {
  const [piece] = assemblyPieces("butterfly", 9);
  assert.notDeepEqual(piece.shape, piece.cover);
  // The first cell is the top-left ninth. A wing reaches toward the cell's outer edge
  // without tracing the cell rectangle itself.
  const shapeLeft = Math.min(...piece.shape.map((point) => point.x));
  const coverLeft = Math.min(...piece.cover.map((point) => point.x));
  assert.ok(shapeLeft > coverLeft, "the wing sits inside the cell rather than on its corner");
  assert.ok(shapeLeft < 0.08);
  const start = poseAt(piece, 0);
  assert.ok(Math.abs(start.x) > 1, "the butterfly starts off the frame");
  assert.equal(start.morph, 0);
});

test("bubbles are round, stars are pointed, and glass shards are not butterflies", () => {
  const butterfly = assemblyPieces("butterfly", 9)[0].shape;
  const bubble = assemblyPieces("bubbles", 9)[0].shape;
  const star = assemblyPieces("stars", 9)[0].shape;
  const glass = assemblyPieces("glass-assemble", 9)[0].shape;
  assert.notDeepEqual(butterfly, bubble);
  assert.notDeepEqual(butterfly, star);
  assert.notDeepEqual(butterfly, glass);
  assert.notDeepEqual(bubble, star);
});

test("mosaic tiles and curtain strips cover their own part of the frame with no gap inside the piece", () => {
  const tile = assemblyPieces("mosaic-assemble", 9)[0];
  assert.deepEqual(tile.shape, tile.cover);

  const strips = assemblyPieces("curtain-assemble", 4);
  assert.equal(strips.length, 4);
  const widths = strips.map((piece) => {
    const xs = piece.cover.map((point) => point.x);
    return Math.max(...xs) - Math.min(...xs);
  });
  for (const width of widths) assert.ok(Math.abs(width - 0.25) < 0.02);
});

test("pieces join in order, and the joined silhouette is the piece's cover", () => {
  const piece = assemblyPieces("butterfly", 9)[3];
  assert.equal(pieceProgress(0, 0, 9, 1700), 0);
  assert.equal(pieceProgress(10_000, 8, 9, 1700), 1);
  assert.ok(pieceProgress(0, 8, 9, 1700) === 0);
  const joined = morphedPoints(piece, 1);
  assert.deepEqual(joined, piece.cover);
  const stillFlying = morphedPoints(piece, 0);
  assert.deepEqual(stillFlying, piece.shape);
});

test("an unknown count falls back to nine pieces for every style", () => {
  for (const style of ["butterfly", "zoom-assemble"] as PhotoAssemblyStyle[]) {
    assert.equal(assemblyPieces(style, undefined).length, 9);
    assert.equal(assemblyPieces(style, 1).length, 4);
    assert.equal(assemblyPieces(style, 40).length, 25);
  }
});
