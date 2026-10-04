import assert from "node:assert/strict";
import { test } from "node:test";
import { promptAnimationActiveSpan, promptAnimationElapsed, promptAnimationSpan, promptParagraphLines, promptPathPose, promptSegmentPose, promptSegmentProgress, promptSegments } from "./promptDesign.ts";

test("prompt reveal units preserve the original text and its indices", () => {
  const text = "First sentence. Second one!\n\nNext paragraph with 😀 words.";
  for (const unit of ["all", "word", "sentence", "paragraph"] as const) {
    const parts = promptSegments(text, unit);
    assert.equal(parts.map((part) => part.text).join(""), text);
    assert.equal(parts[0].start, 0);
    assert.equal(parts.at(-1)?.end, [...text].length);
    assert.ok(parts.every((part, index) => index === 0 || part.start === parts[index - 1].end));
  }
  assert.equal(promptSegments(text, "paragraph").length, 2);
  assert.ok(promptSegments(text, "word").length > promptSegments(text, "sentence").length);
});

test("repeat timing finishes after a count and loops forever when requested", () => {
  const text = "one two";
  const animation = { unit: "word" as const, effect: "bounce" as const, durationMs: 400, delayMs: 100, staggerMs: 200, repeat: 2 };
  const cycle = promptAnimationSpan(text, animation);
  const active = promptAnimationActiveSpan(text, animation);
  assert.ok(cycle > active);
  assert.equal(promptAnimationElapsed(text, animation, active + 50), active);
  assert.equal(promptAnimationElapsed(text, animation, cycle + 50), 50);
  assert.equal(promptAnimationElapsed(text, animation, cycle * 2), active);
  assert.equal(promptAnimationElapsed(text, { ...animation, repeat: null }, cycle * 2 + 50), 50);
  assert.equal(promptAnimationElapsed(text, animation, Infinity), active);
});

test("path and paragraph layouts remain finite across all shapes", () => {
  for (const shape of ["straight", "arc-up", "arc-down", "circle", "wave", "s-curve", "zigzag", "spiral"] as const) {
    for (const position of [0, 0.25, 0.5, 0.75, 1]) {
      const pose = promptPathPose(shape, position, 400, 30, 60);
      assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.angle));
    }
  }
  for (const shape of ["normal", "narrow", "wide", "diamond", "oval"] as const) {
    const lines = promptParagraphLines("A longer question with several words and a second line\nthat should remain visible.", shape, 15);
    assert.ok(lines.length >= 2);
    assert.ok(lines.every((line) => line.end >= line.start));
  }
  assert.ok(Math.abs(promptSegmentPose("bounce", 1).y) < 1e-9);
  assert.ok(Math.abs(promptSegmentPose("bounce", 0.5, 10).y) < Math.abs(promptSegmentPose("bounce", 0.5, 40).y));
  for (const effect of ["drop", "float", "pulse"] as const) {
    const pose = promptSegmentPose(effect, 0.5, 24);
    assert.ok(Number.isFinite(pose.x) && Number.isFinite(pose.y) && Number.isFinite(pose.scale));
    assert.ok(Math.abs(promptSegmentPose(effect, 1, 24).y) < 1e-9);
  }
});

test("pinch grows both ends, bulge grows the middle, and tapers are directional", async () => {
  const { promptLetterScale } = await import("./promptDesign.ts");
  assert.ok(promptLetterScale("pinch", 0) > promptLetterScale("pinch", 0.5));
  assert.equal(promptLetterScale("pinch", 0), promptLetterScale("pinch", 1));
  assert.ok(promptLetterScale("bulge", 0.5) > promptLetterScale("bulge", 0));
  assert.ok(promptLetterScale("grow", 1) > promptLetterScale("grow", 0));
  assert.ok(promptLetterScale("shrink", 0) > promptLetterScale("shrink", 1));
  assert.equal(promptLetterScale(undefined, 0.4), 1);
});

test("by-letter animation keeps emoji and combined characters whole with staggered timing", () => {
  const text = "A👨‍👩‍👧‍👦e\u0301 B\nC";
  const segments = promptSegments(text, "letter");
  assert.deepEqual(segments.map((s) => s.text), ["A", "👨‍👩‍👧‍👦", "e\u0301", " ", "B", "\n", "C"]);
  assert.deepEqual(segments.map((s) => [s.start, s.end]), [[0,1],[1,2],[2,3],[3,4],[4,5],[5,6],[6,7]]);
  const animation = { unit: "letter" as const, effect: "fade" as const, durationMs: 200, delayMs: 100, staggerMs: 80 };
  assert.equal(promptSegmentProgress(animation, 0, 150), 0.25);
  assert.equal(promptSegmentProgress(animation, 1, 150), 0);
  assert.equal(promptSegmentProgress(animation, 6, 780), 1);
});
