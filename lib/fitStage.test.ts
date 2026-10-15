import assert from "node:assert/strict";
import { test } from "node:test";
import { fitStage, liveStageSize } from "./fitStage.ts";

test("web stretches to fill while mobile preserves portrait framing", () => {
  assert.deepEqual(liveStageSize(1400, 700, 1280, 720, false), { width: 1400, height: 700 });
  const mobileOnDesktop = liveStageSize(1400, 800, 432, 768, true);
  assert.ok(Math.abs(mobileOnDesktop.width - 450) < 0.001);
  assert.equal(mobileOnDesktop.height, 800);
  assert.deepEqual(liveStageSize(360, 800, 432, 768, true), { width: 360, height: 640 });
  assert.deepEqual(liveStageSize(0, 800, 432, 768, true), { width: 0, height: 0 });
});

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
