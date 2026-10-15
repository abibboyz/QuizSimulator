import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FLIP_MS, GAME_LIMITS, HANDLE_ASSETS, allowsMultiCorrect, canPickAt, displayOptions, dragHandleRefs, dragPoint, flipCard, handlePose,
  hashString, isAnswerCorrect, isGameKind, lockedMs, memoryState, pickMode, popAppearance, popTapTime, popVisible, resolveGame, seededShuffle,
  timedRevealShown, togglesPicks, toggleSequencePick,
} from "./gameTypes.ts";
import type { MediaRef, Question } from "../types/quiz.ts";

const opts = (n: number, correct: number[]) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, text: `O${i}`, correct: correct.includes(i) }));
const q = (kind: Question["kind"], n = 4, correct = [0], game?: Question["game"]): Question => ({ id: `q-${kind}`, kind, layout: "grid", prompt: "p", options: opts(n, correct), ...(game ? { game } : {}) });

test("isGameKind: only the six new kinds", () => {
  for (const kind of ["memory-flip", "pop-match", "star-collect", "drag-match", "sequence", "timed-reveal"]) assert.ok(isGameKind(kind), kind);
  for (const kind of ["multiple-choice", "true-false", "multi-select", "image-choice", "reveal"]) assert.ok(!isGameKind(kind), kind);
});

test("resolveGame: defaults, and every number is clamped", () => {
  const d = resolveGame(q("memory-flip"));
  assert.deepEqual([d.animate, d.speed, d.rememberMs, d.memoryMode, d.popFrom, d.stars, d.dragHandle.kind, d.videoChoice], [true, "normal", 3000, "flip", "random", 3, "stick", "star"]);
  const wild = resolveGame(q("memory-flip", 4, [0], { rememberMs: 999999, popMs: -5, popCount: 99, stars: 0, stepMs: 1 }));
  assert.equal(wild.rememberMs, GAME_LIMITS.rememberMs.max);
  assert.equal(wild.popMs, GAME_LIMITS.popMs.min);
  assert.equal(wild.popCount, 4, "never more items than answers (and at most 5)");
  assert.equal(wild.stars, GAME_LIMITS.stars.min);
  assert.equal(wild.stepMs, GAME_LIMITS.stepMs.min);
  assert.equal(resolveGame(q("pop-match", 9, [0], { popCount: 99 })).popCount, GAME_LIMITS.popCount.max);
  assert.equal(resolveGame(q("memory-flip", 4, [0], { speed: "fast" })).factor < 1, true);
});

test("resolveGame: a custom handle without an image falls back to the Stick", () => {
  assert.equal(resolveGame(q("drag-match", 3, [0], { dragHandle: { kind: "custom" } })).dragHandle.kind, "stick");
  const image: MediaRef = { kind: "stored", id: "h", w: 10, h: 10 };
  const custom = resolveGame(q("drag-match", 3, [0], { dragHandle: { kind: "custom", image } })).dragHandle;
  assert.deepEqual(custom, { kind: "custom", image });
  assert.equal(resolveGame(q("drag-match", 3, [0], { dragHandle: { kind: "hand" } })).dragHandle.kind, "hand");
});

test("pickMode: sequence is ordered; multi only where several correct answers are allowed", () => {
  assert.equal(pickMode(q("sequence", 3, [0, 1, 2])), "ordered");
  assert.equal(pickMode(q("memory-flip", 4, [0, 1])), "multi");
  assert.equal(pickMode(q("memory-flip", 4, [0])), "single");
  assert.equal(pickMode(q("drag-match", 4, [0, 1])), "single");
  assert.equal(pickMode(q("star-collect", 4, [0, 1])), "single");
  assert.equal(pickMode(q("multi-select", 4, [0, 1])), "single", "classic kinds keep their own logic");
  assert.ok(togglesPicks(q("pop-match", 4, [0, 1])) && !togglesPicks(q("multiple-choice")));
  assert.ok(allowsMultiCorrect("timed-reveal") && !allowsMultiCorrect("drag-match"));
});

test("isAnswerCorrect: sequence needs every answer in authored order; others need exactly the ticked set", () => {
  const seq = q("sequence", 3, [0, 1, 2]);
  assert.ok(isAnswerCorrect(seq, ["o0", "o1", "o2"]));
  assert.ok(!isAnswerCorrect(seq, ["o1", "o0", "o2"]));
  assert.ok(!isAnswerCorrect(seq, ["o0", "o1"]));
  assert.ok(!isAnswerCorrect(seq, []));
  const pop = q("pop-match", 4, [0, 1]);
  assert.ok(isAnswerCorrect(pop, ["o1", "o0"]));
  assert.ok(!isAnswerCorrect(pop, ["o0"]));
  assert.ok(!isAnswerCorrect(pop, ["o0", "o1", "o2"]));
  assert.ok(isAnswerCorrect(q("multiple-choice"), ["o0"]), "classic questions score exactly as before");
});

test("toggleSequencePick: tapping a picked answer removes it and everything after it", () => {
  assert.deepEqual(toggleSequencePick([], "a"), ["a"]);
  assert.deepEqual(toggleSequencePick(["a", "b"], "c"), ["a", "b", "c"]);
  assert.deepEqual(toggleSequencePick(["a", "b", "c"], "b"), ["a"]);
});

test("displayOptions: sequence is shuffled deterministically and never shows the answer; others keep their order", () => {
  for (let n = 2; n <= 8; n++) {
    for (const id of ["a", "b", "c", "d", "e"]) {
      const seq = { ...q("sequence", n, Array.from({ length: n }, (_, i) => i)), id };
      const shown = displayOptions(seq);
      assert.notDeepEqual(shown.map((o) => o.id), seq.options.map((o) => o.id), `n=${n} id=${id}`);
      assert.deepEqual(shown.map((o) => o.id), displayOptions(seq).map((o) => o.id), "deterministic");
      assert.deepEqual([...shown.map((o) => o.id)].sort(), seq.options.map((o) => o.id).sort(), "same answers");
    }
  }
  const mc = q("memory-flip");
  assert.equal(displayOptions(mc), mc.options);
});

test("seededShuffle / hashString are stable", () => {
  assert.equal(hashString("abc"), hashString("abc"));
  assert.notEqual(hashString("abc"), hashString("abd"));
  assert.deepEqual(seededShuffle([1, 2, 3, 4, 5], 7), seededShuffle([1, 2, 3, 4, 5], 7));
});

test("memoryState: remember phase, then a real flip (width through a sliver), then face down and playable", () => {
  const m = q("memory-flip", 4, [0], { rememberMs: 3000 });
  assert.deepEqual([memoryState(m, 0).phase, memoryState(m, 0).faceDown, memoryState(m, 0).remainingMs], ["remember", false, 3000]);
  assert.equal(memoryState(m, 2999).faceDown, false);
  const mid = memoryState(m, 3000 + FLIP_MS / 2);
  assert.ok(mid.scaleX < 0.1, "edge-on half way through the flip");
  assert.equal(memoryState(m, 3000 + FLIP_MS * 0.25).faceDown, false, "still the face before half way");
  assert.equal(memoryState(m, 3000 + FLIP_MS * 0.75).faceDown, true, "the back after half way");
  const done = memoryState(m, 3000 + FLIP_MS + 1);
  assert.deepEqual([done.faceDown, done.scaleX, done.flip], [true, 1, 1]);
  const recall = q("memory-flip", 4, [0], { rememberMs: 3000, memoryMode: "recall" });
  assert.equal(memoryState(recall, 5000).faceDown, false, "recall mode never turns cards over");
  assert.equal(flipCard(0).scaleX, 1);
  assert.equal(flipCard(1).scaleX, 1);
});

test("memory-flip locks picking during the remember phase and the flip; other kinds never lock", () => {
  const m = q("memory-flip", 4, [0], { rememberMs: 2000 });
  assert.equal(lockedMs(m), 2000 + FLIP_MS);
  assert.ok(!canPickAt(m, 1999) && !canPickAt(m, 2000) && canPickAt(m, 2000 + FLIP_MS));
  assert.equal(lockedMs({ ...m, game: { rememberMs: 2000, animate: false } }), 2000, "no flip time with animation off");
  assert.equal(lockedMs(q("pop-match")), 0);
  assert.ok(canPickAt(q("drag-match"), 0));
});

test("animation off: memory flips instantly", () => {
  const m = q("memory-flip", 4, [0], { rememberMs: 1500, animate: false });
  assert.equal(memoryState(m, 1500).faceDown, true);
  assert.equal(memoryState(m, 1500).scaleX, 1);
});

test("timedRevealShown: one answer every step", () => {
  const t = q("timed-reveal", 4, [1], { stepMs: 1000 });
  assert.deepEqual([0, 1, 2, 3].map((i) => timedRevealShown(t, i, 1500)), [true, true, false, false]);
});

test("popAppearance: deterministic, in bounds, edges only slide in from an edge", () => {
  for (const popFrom of ["random", "edges", "mixed"] as const) {
    const p = q("pop-match", 5, [0, 1], { popFrom, popCount: 3, popMs: 2400 });
    for (let s = 0; s < 40; s++) {
      const a = popAppearance(p, s);
      assert.deepEqual(a, popAppearance(p, s), "pure in (question, s)");
      assert.ok(a.x > 0 && a.x < 1 && a.y > 0 && a.y < 1, `inside the field: ${a.x},${a.y}`);
      assert.ok(a.optionIndex >= 0 && a.optionIndex < 5);
      assert.equal(a.end - a.start, 2400);
      if (popFrom === "edges") assert.ok(a.edge, "edge mode always has an edge");
      if (popFrom === "random") assert.equal(a.edge, null);
    }
  }
  const a = popAppearance(q("pop-match", 5), 3);
  const b = popAppearance({ ...q("pop-match", 5), id: "another" }, 3);
  assert.ok(a.x !== b.x || a.y !== b.y || a.optionIndex !== b.optionIndex, "another question pops differently");
});

test("popAppearance: every answer pops once per round, so each one can be tapped", () => {
  const p = q("pop-match", 5, [0], { popCount: 2 });
  assert.deepEqual([0, 1, 2, 3, 4].map((s) => popAppearance(p, s).optionIndex).sort(), [0, 1, 2, 3, 4]);
});

test("popVisible: at most popCount items at once, each inside its window", () => {
  const p = q("pop-match", 5, [0], { popCount: 3, popMs: 2400 });
  for (let clock = 0; clock < 12000; clock += 130) {
    const visible = popVisible(p, clock);
    assert.ok(visible.length <= 3, `at ${clock}: ${visible.length}`);
    for (const a of visible) assert.ok(clock >= a.start && clock < a.end);
  }
  assert.equal(popVisible(p, -1).length, 0);
});

test("popTapTime: lands inside a pop of that answer, and no later than the limit", () => {
  const p = q("pop-match", 5, [2], { popCount: 2, popMs: 2000 });
  const at = popTapTime(p, "o2", 9000);
  assert.ok(at <= 9000);
  assert.ok(popVisible(p, at).some((a) => a.optionIndex === 2), "the answer is on screen when tapped");
});

test("dragPoint: starts at the item, ends on the target, arcs between", () => {
  const from = { x: 0, y: 100 }, to = { x: 200, y: 100 };
  assert.deepEqual(dragPoint(from, to, 0), { x: 0, y: 100, lifted: 0 });
  const end = dragPoint(from, to, 1);
  assert.ok(Math.abs(end.x - 200) < 1e-9 && Math.abs(end.y - 100) < 1e-9);
  assert.ok(dragPoint(from, to, 0.5).y < 100, "lifted at the middle");
});

test("dragHandleRefs: the default handles are shipped SVGs; custom uses the upload; other kinds need nothing", () => {
  assert.deepEqual(dragHandleRefs(q("drag-match")), [HANDLE_ASSETS.stick]);
  assert.deepEqual(dragHandleRefs(q("drag-match", 3, [0], { dragHandle: { kind: "hand" } })), [HANDLE_ASSETS.hand, HANDLE_ASSETS["hand-grab"]]);
  const image: MediaRef = { kind: "stored", id: "mine", w: 64, h: 64 };
  assert.deepEqual(dragHandleRefs(q("drag-match", 3, [0], { dragHandle: { kind: "custom", image } })), [image]);
  assert.deepEqual(dragHandleRefs(q("memory-flip")), []);
});

test("handlePose animates while dragging and idles when it is not", () => {
  const idle = handlePose("stick", false, 0, 0);
  const drag = handlePose("stick", true, 900, 50);
  assert.ok(Math.abs(drag.rotate) > Math.abs(idle.rotate), "tilts with the pointer's speed");
  assert.notDeepEqual(handlePose("hand", true, 0, 0), handlePose("hand", true, 0, 90));
});
