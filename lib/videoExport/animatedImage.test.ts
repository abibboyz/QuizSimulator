import assert from "node:assert/strict";
import { test } from "node:test";
import { frameIndexAt, frameSource } from "./animatedImage.ts";

test("an animated picture loops through its frames on the export clock", () => {
  const frames = [{ durationUs: 400_000 }, { durationUs: 400_000 }];
  assert.equal(frameIndexAt(frames, 0), 0);
  assert.equal(frameIndexAt(frames, 399), 0);
  assert.equal(frameIndexAt(frames, 400), 1);
  assert.equal(frameIndexAt(frames, 799), 1);
  assert.equal(frameIndexAt(frames, 800), 0);
  assert.equal(frameIndexAt(frames, 1200), 1);
});

test("a zero GIF delay is held for a tenth of a second, and time before zero still loops", () => {
  const frames = [{ durationUs: 0 }, { durationUs: 100_000 }];
  assert.equal(frameIndexAt(frames, 0), 0);
  assert.equal(frameIndexAt(frames, 100), 1);
  assert.equal(frameIndexAt(frames, -50), 1);
});

test("a still picture ignores the clock", () => {
  const still = { source: "still" as unknown as CanvasImageSource };
  assert.equal(frameSource(still, 500), "still");

  const moving = {
    source: "a" as unknown as CanvasImageSource,
    frames: [
      { source: "a" as unknown as CanvasImageSource, durationUs: 100_000 },
      { source: "b" as unknown as CanvasImageSource, durationUs: 100_000 },
    ],
  };
  assert.equal(frameSource(moving, 0), "a");
  assert.equal(frameSource(moving, 100), "b");
  assert.equal(frameSource(moving, 200), "a");
});
