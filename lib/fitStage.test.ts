import assert from "node:assert/strict";
import { test } from "node:test";
import { fitStage } from "./fitStage.ts";

test("desktop stage fits both dimensions, including a tall 50-answer layout", () => {
  for (const [width, height, contentHeight] of [[1280, 720, 720], [1024, 600, 720], [1920, 1080, 3000], [700, 450, 1800]]) {
    const scale = fitStage(width, height, 1280, contentHeight);
    assert.ok(1280 * scale <= width + 0.001);
    assert.ok(contentHeight * scale <= height + 0.001);
    assert.ok(scale > 0);
  }
});

test("hidden or invalid frame dimensions cannot produce an invalid transform", () => {
  assert.equal(fitStage(0, 600, 1280, 720), 0);
  assert.equal(fitStage(100, NaN, 1280, 720), 0);
});
