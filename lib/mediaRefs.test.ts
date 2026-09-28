import assert from "node:assert/strict";
import { test } from "node:test";
import { collectRefs, remapMedia } from "./mediaRefs.ts";
import { schemaVersionFor, validateQuiz, type MediaRef, type Question, type Quiz } from "../types/quiz.ts";

const ref = (id: string): MediaRef => ({ kind: "stored", id, w: 400, h: 300 });

const oldQuestion: Question = {
  id: "q1",
  kind: "multiple-choice",
  layout: "image-top",
  prompt: "Which planet is this?",
  media: ref("planet"),
  options: [
    { id: "a", text: "Mars", correct: true, media: ref("opt") },
    { id: "b", text: "Venus", correct: false },
  ],
};

/** A quiz exactly as a pre-Reveal build saved it: no `reveal`, no `motion` anywhere. */
const oldQuiz = (): Quiz =>
  ({
    id: "old",
    title: "Old quiz",
    createdAt: 1,
    updatedAt: 1,
    schemaVersion: 1,
    theme: { bgImage: ref("bg") },
    settings: { cues: {}, progressMascotMedia: ref("mascot") },
    questions: [oldQuestion],
  }) as unknown as Quiz;

const revealQuestion: Question = {
  id: "q2",
  kind: "reveal",
  layout: "grid",
  prompt: "Guess the landmark",
  media: ref("answer"),
  options: [
    { id: "c", text: "Eiffel Tower", correct: true },
    { id: "d", text: "Big Ben", correct: false },
  ],
  reveal: { animation: "tiles", cover: ref("cover") },
};

test("back-compat: an old quiz's media refs are exactly what they were", () => {
  assert.deepEqual(
    collectRefs(oldQuiz()).map((r) => (r.kind === "stored" ? r.id : r.url)),
    ["bg", "planet", "opt", "mascot"],
  );
});

test("back-compat: remapping an old quiz adds no new keys (it saves back byte-identical)", () => {
  const out = remapMedia(oldQuiz(), new Map());
  assert.equal("reveal" in out.questions[0], false);
  assert.equal("motion" in out.questions[0], false);
  assert.equal("motion" in out.settings, false);
  const remapped = remapMedia(oldQuiz(), new Map([["planet", "planet2"]]));
  assert.deepEqual(remapped.questions[0].media, ref("planet2"));
});

test("back-compat: validation of an old quiz is unchanged", () => {
  assert.deepEqual(validateQuiz(oldQuiz()), []);
});

test("Reveal covers are collected (so GC and export keep them) and remapped on import", () => {
  const quiz = { ...oldQuiz(), questions: [oldQuestion, revealQuestion] };
  const ids = collectRefs(quiz).map((r) => (r.kind === "stored" ? r.id : ""));
  assert.ok(ids.includes("answer"));
  assert.ok(ids.includes("cover"));

  const out = remapMedia(
    quiz,
    new Map([
      ["cover", "cover2"],
      ["answer", "answer2"],
    ]),
  );
  assert.deepEqual(out.questions[1].reveal?.cover, ref("cover2"));
  assert.deepEqual(out.questions[1].media, ref("answer2"));
  assert.equal(out.questions[1].reveal?.animation, "tiles", "other reveal settings survive");
});

test("a cover is kept even after the question is switched to another kind (no GC surprise on switching back)", () => {
  const switched: Question = { ...revealQuestion, kind: "multiple-choice" };
  const ids = collectRefs({ ...oldQuiz(), questions: [switched] }).map((r) => (r.kind === "stored" ? r.id : ""));
  assert.ok(ids.includes("cover"));
});

test("schemaVersionFor: files that use nothing new stay version 1 so older builds can open them", () => {
  assert.equal(schemaVersionFor(oldQuiz()), 1);
  assert.equal(schemaVersionFor({ ...oldQuiz(), questions: [oldQuestion, revealQuestion] }), 2);
  assert.equal(
    schemaVersionFor({ ...oldQuiz(), questions: [{ ...oldQuestion, motion: { answers: { enter: "pop" } } }] }),
    2,
  );
  const withGlobal = oldQuiz();
  withGlobal.settings = { ...withGlobal.settings, motion: { question: { enter: "fade" } } };
  assert.equal(schemaVersionFor(withGlobal), 2);
});
