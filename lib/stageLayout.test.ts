import assert from "node:assert/strict";
import test from "node:test";
import { clampStagePlacement, stagePlacementFor, withStagePlacement } from "./stageLayout.ts";

test("stage placement clamps inside its responsive frame", () => {
  assert.deepEqual(clampStagePlacement({ x: 90, y: -4, width: 40, height: 120 }), { x: 60, y: 0, width: 40, height: 100 });
});

test("question layout overrides the all-question default per item and view", () => {
  const global = { stageLayout: { web: { question: { x: 0, y: 0, width: 50, height: 30 } } } };
  const question = { stageLayout: { web: { question: { x: 50, y: 10, width: 50, height: 40 } } } };
  assert.equal(stagePlacementFor(global, question, "web", "question")?.x, 50);
  assert.equal(stagePlacementFor(global, question, "mobile", "question"), null);
});

test("clearing the final placement removes empty layout records", () => {
  const layout = withStagePlacement(undefined, "web", "answers", { x: 0, y: 50, width: 100, height: 50 });
  assert.equal(withStagePlacement(layout, "web", "answers", null), undefined);
});
