import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeCue,
  cueEnabled,
  cueHoldMs,
  cueSetRefs,
  CUE_SLOTS,
  mapCueSet,
  PER_QUESTION_CUE_SLOTS,
  quizCueRefs,
  resolveCue,
} from "./cues.ts";
import type { Cue, CueSet, MediaRef, Question, Quiz } from "../types/quiz.ts";

const cue = (over: Partial<Cue> = {}): Cue => ({
  animation: "confetti",
  sound: "fanfare",
  durationMs: 1500,
  ...over,
});

const question = (cues?: CueSet): Question => ({
  id: "q1",
  kind: "multiple-choice",
  layout: "grid",
  prompt: "",
  options: [],
  cues,
});

const quiz = (cues: CueSet, questions: Question[] = []): Pick<Quiz, "settings" | "questions"> =>
  ({ settings: { cues }, questions }) as Pick<Quiz, "settings" | "questions">;

/* ------------------------------------------------------------- resolution */

test("falls through to the quiz-wide cue when the question says nothing", () => {
  const wide = cue();
  assert.deepEqual(resolveCue(quiz({ correct: wide }), question(), "correct"), wide);
  assert.deepEqual(resolveCue(quiz({ correct: wide }), undefined, "correct"), wide);
});

test("a question's own cue wins over the quiz-wide one", () => {
  const mine = cue({ animation: "stars", sound: null });
  const resolved = resolveCue(quiz({ correct: cue() }), question({ correct: mine }), "correct");
  assert.deepEqual(resolved, mine);
});

test("an explicit null silences an inherited cue", () => {
  // This is the whole reason resolution checks key presence rather than
  // truthiness — `null` has to beat the quiz-wide default, not fall through it.
  assert.equal(resolveCue(quiz({ correct: cue() }), question({ correct: null }), "correct"), null);
});

test("an unrelated slot on the question doesn't shadow other slots", () => {
  const wide = cue();
  const q = question({ wrong: null });
  assert.deepEqual(resolveCue(quiz({ correct: wide }), q, "correct"), wide);
  assert.equal(resolveCue(quiz({ correct: wide }), q, "wrong"), null);
});

test("nothing set anywhere resolves to nothing", () => {
  assert.equal(resolveCue(quiz({}), question(), "intro"), null);
  assert.equal(resolveCue(quiz({}), question(), "outro"), null);
});

/* ---------------------------------------------------------------- enabled */

test("a cue counts only when it would actually play", () => {
  assert.equal(cueEnabled(null), false);
  assert.equal(cueEnabled(cue({ animation: null, sound: null })), false, "empty cue does nothing");
  assert.equal(cueEnabled(cue({ animation: null, sound: "whoosh" })), true, "sound alone is enough");
  assert.equal(cueEnabled(cue({ animation: "shake", sound: null })), true, "motion alone is enough");
});

test("an image cue with no picture uploaded has nothing to draw", () => {
  assert.equal(cueEnabled(cue({ animation: "image", sound: null })), false);
  assert.equal(
    cueEnabled(cue({ animation: "image", sound: "correct" })),
    true,
    "but it still plays if it carries a sound",
  );
  const withMedia = cue({ animation: "image", sound: null, media: { kind: "url", url: "x.gif" } });
  assert.equal(cueEnabled(withMedia), true);
});

test("activeCue skips a resolved cue that would do nothing", () => {
  const dead = cue({ animation: null, sound: null });
  assert.equal(activeCue(quiz({ intro: dead }), question(), "intro"), null);
  assert.deepEqual(activeCue(quiz({ intro: cue() }), question(), "intro"), cue());
});

/* --------------------------------------------------------------- duration */

test("hold time stays in a range that can't stall or flash past", () => {
  assert.equal(cueHoldMs(cue({ durationMs: 1500 })), 1500);
  assert.equal(cueHoldMs(cue({ durationMs: 0 })), 200, "zero would never be seen");
  assert.equal(cueHoldMs(cue({ durationMs: -400 })), 200);
  assert.equal(cueHoldMs(cue({ durationMs: 999999 })), 15000, "capped so a run can't hang");
  assert.equal(cueHoldMs(cue({ durationMs: NaN })), 1500, "falls back to the default");
});

/* ------------------------------------------------------------------ media */

test("collects cue pictures from the quiz and every question", () => {
  const a: MediaRef = { kind: "stored", id: "a", w: 1, h: 1 };
  const b: MediaRef = { kind: "stored", id: "b", w: 1, h: 1 };

  const refs = quizCueRefs(
    quiz({ correct: cue({ animation: "image", media: a }) }, [
      question({ between: cue({ animation: "image", media: b }) }),
      question(),
    ]),
  );

  assert.deepEqual(
    refs.map((r) => (r.kind === "stored" ? r.id : r.url)),
    ["a", "b"],
  );
});

test("cue sets with nothing to collect yield nothing", () => {
  assert.deepEqual(cueSetRefs(undefined), []);
  assert.deepEqual(cueSetRefs({ correct: null, wrong: cue() }), []);
});

test("remapping rewrites cue media ids and leaves explicit nulls alone", () => {
  const remapped = mapCueSet({ correct: cue({ media: { kind: "stored", id: "old", w: 2, h: 2 } }), wrong: null }, (ref) =>
    ref && ref.kind === "stored" ? { ...ref, id: "new" } : ref,
  );

  assert.equal(remapped?.correct?.media?.kind === "stored" && remapped.correct.media.id, "new");
  assert.equal(remapped?.wrong, null, "a deliberate silence survives the copy");
});

/* ------------------------------------------------- per-question overrides */

test("only the slots a question can actually influence are offered", () => {
  // intro and outro resolve with no question in scope, so a per-question value
  // for them could never be read.
  assert.deepEqual(PER_QUESTION_CUE_SLOTS, ["correct", "wrong", "between"]);
  for (const slot of PER_QUESTION_CUE_SLOTS) {
    assert.ok(CUE_SLOTS.includes(slot), `${slot} should be a real slot`);
  }
});

test("the three override states are distinguishable", () => {
  const wide = quiz({ correct: cue() });

  // Absent: inherit.
  assert.deepEqual(resolveCue(wide, question({}), "correct"), cue());
  // Null: deliberately silent, overriding the quiz default.
  assert.equal(resolveCue(wide, question({ correct: null }), "correct"), null);
  // Present: this question's own.
  const mine = cue({ animation: "shake", sound: null });
  assert.deepEqual(resolveCue(wide, question({ correct: mine }), "correct"), mine);
});

test("a custom override with nothing chosen plays nothing", () => {
  // The editor keeps an empty custom cue rather than collapsing it to null, so
  // the row doesn't jump back to "Silent" mid-edit. Both must stay inert.
  const empty = cue({ animation: null, sound: null });
  assert.equal(activeCue(quiz({ correct: cue() }), question({ correct: empty }), "correct"), null);
});
