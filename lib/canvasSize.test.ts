import { test } from "node:test";
import assert from "node:assert/strict";
import { aspectBoxHeight, canvasBackingSize } from "./canvasSize.ts";

/**
 * The builder cover preview grew on its own (worst while scrolling): its
 * canvas was in flow, so its CSS height came from the backing store, which was
 * set from the measured CSS size. These tests model one measure → resize round
 * trip per ResizeObserver callback.
 */
const inFlowHeight = (cssWidth: number, backing: { width: number; height: number }) =>
  (cssWidth * backing.height) / backing.width;

test("regression: the old in-flow canvas grows every round trip (documents the bug)", () => {
  const width = 123.4; // the builder preview's real width at 1280×800, 1×
  let height = 204.7;
  for (let i = 0; i < 60; i++) height = inFlowHeight(width, canvasBackingSize(width, height, 1));
  assert.ok(height > 240, `expected runaway growth, got ${height}`);
});

test("regression: an out-of-flow canvas keeps its box size under repeated measure", () => {
  for (const dpr of [1, 1.25, 1.5, 2, 2.625, 3, 4]) {
    for (const width of [123.4, 191.99, 287.5, 333.33, 400, 1079.7]) {
      for (const aspect of [16 / 9, 0.6429, 1, 3, 450 / 700]) {
        const height = aspectBoxHeight(width, aspect);
        let backing = canvasBackingSize(width, height, dpr);
        for (let i = 0; i < 200; i++) {
          // Layout never reads the canvas, so a new measurement is the same box.
          const measured = aspectBoxHeight(width, aspect);
          assert.equal(measured, height);
          const next = canvasBackingSize(width, measured, dpr);
          assert.deepEqual(next, backing);
          backing = next;
        }
      }
    }
  }
});

test("canvasBackingSize clamps DPR, rounds, and never returns an empty canvas", () => {
  assert.deepEqual(canvasBackingSize(100, 50, 2), { width: 200, height: 100 });
  assert.deepEqual(canvasBackingSize(100, 50, 5), { width: 300, height: 150 });
  assert.deepEqual(canvasBackingSize(0, 0, 2), { width: 1, height: 1 });
  assert.deepEqual(canvasBackingSize(10, 10, Number.NaN), { width: 10, height: 10 });
  assert.equal(aspectBoxHeight(160, 16 / 9), 90);
  assert.equal(aspectBoxHeight(120, 0), 90); // bad aspect falls back to 4:3
});
