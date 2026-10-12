import assert from "node:assert/strict";
import { test } from "node:test";
import { DEFAULT_SETTINGS } from "./factory.ts";
import { clampTimerOrigin, timerPlacementFor, timerScale, timerScaleForEdge, withTimerPlacement } from "./timerPlacement.ts";

test("an undragged timer has no placement, so it stays in the header", () => {
  assert.equal(timerPlacementFor(DEFAULT_SETTINGS, "web"), null);
  assert.equal(timerPlacementFor(DEFAULT_SETTINGS, "mobile"), null);
  assert.equal(timerPlacementFor(undefined, "web"), null);
  assert.equal(timerPlacementFor({ timerPlacement: { web: { x: Number.NaN, y: 10 } } }, "web"), null);
});

test("web and mobile spots are independent", () => {
  const web = withTimerPlacement(undefined, "web", { x: 12, y: 80 });
  assert.deepEqual(web, { web: { x: 12, y: 80 } });
  const both = withTimerPlacement(web, "mobile", { x: 70, y: 4 });
  assert.deepEqual(both, { web: { x: 12, y: 80 }, mobile: { x: 70, y: 4 } });
  assert.deepEqual(timerPlacementFor({ timerPlacement: both }, "web"), { x: 12, y: 80 });
  assert.deepEqual(timerPlacementFor({ timerPlacement: both }, "mobile"), { x: 70, y: 4 });
  assert.equal(withTimerPlacement(withTimerPlacement(both, "web", null), "mobile", null), undefined);
});

test("a timer that was only moved keeps its original length", () => {
  const web = withTimerPlacement(undefined, "web", { x: 12, y: 80, scale: 2.5 });
  assert.deepEqual(web, { web: { x: 12, y: 80, scale: 2.5 } });
  const both = withTimerPlacement(web, "mobile", { x: 4, y: 6 });
  assert.deepEqual(both, { web: { x: 12, y: 80, scale: 2.5 }, mobile: { x: 4, y: 6 } });
  assert.equal(timerScale(undefined), 1);
  assert.equal(timerScale(2.5), 2.5);
  assert.equal(timerScale(0), 0.5);
  assert.equal(timerScale(40), 8);
});

test("dragging the end point lengthens the timer and stops at the frame", () => {
  assert.equal(timerScaleForEdge(1130, 1000, 40, 64, 64, 1280, 720), 130 / 64);
  assert.equal(timerScaleForEdge(4000, 1000, 40, 64, 64, 1280, 720), (1280 - 1000) / 64);
  assert.equal(timerScaleForEdge(900, 1000, 40, 64, 64, 1280, 720), 0.5);
  assert.equal(timerScaleForEdge(1100, 1000, 40, 0, 64, 1280, 720), 1);
});

test("a placed timer stays inside the frame", () => {
  assert.deepEqual(clampTimerOrigin(100, 100, 64, 64, 1280, 720), {
    x: ((1280 - 64) / 1280) * 100,
    y: ((720 - 64) / 720) * 100,
  });
  assert.deepEqual(clampTimerOrigin(-20, 10, 64, 64, 400, 800), { x: 0, y: 10 });
  assert.deepEqual(clampTimerOrigin(50, 50, 500, 900, 400, 800), { x: 0, y: 0 });
});
