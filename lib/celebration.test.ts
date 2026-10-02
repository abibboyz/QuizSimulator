import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuiz } from "./factory.ts";
import { buildTimeline } from "./videoExport/timeline.ts";
import { collectRefs, imageRefs, remapMedia } from "./mediaRefs.ts";
import {
  celebrationAnimation,
  celebrationDelayMs,
  celebrationEnabled,
  celebrationView,
} from "./celebration.ts";
import { schemaVersionFor, type MediaRef, type Question, type Quiz } from "../types/quiz.ts";

const picture = (id: string): MediaRef => ({ kind: "stored", id, w: 400, h: 300 });

const question = (over: Partial<Question> = {}): Question => ({
  id: "q1",
  kind: "multiple-choice",
  layout: "grid",
  prompt: "Capital of France?",
  options: [
    { id: "a", text: "Paris", correct: true },
    { id: "b", text: "Lyon", correct: false },
  ],
  ...over,
});

test("a question that doesn't celebrate resolves to nothing", () => {
  assert.equal(celebrationEnabled(question()), false);
  assert.equal(celebrationView(question()), null);
  assert.equal(celebrationView(question({ celebration: { enabled: false, image: picture("kept") } })), null);
  assert.equal(celebrationAnimation(question()), "confetti");
  assert.equal(celebrationAnimation(question({ celebration: { enabled: true, animation: "nope" as "none" } })), "confetti");
});

test("an empty correct answer does not get a stand-in label", () => {
  const view = celebrationView(
    question({
      celebration: { enabled: true },
      options: [
        { id: "a", text: "   ", correct: true },
        { id: "b", text: "Lyon", correct: false },
      ],
    }),
  );
  assert.deepEqual(view, { images: [], lines: [], text: "" });
});

test("the card shows only the right answer's own words", () => {
  const view = celebrationView(question({ celebration: { enabled: true } }));
  assert.deepEqual(view, { images: [], lines: ["Paris"], text: "Paris" });

  const many = question({
    kind: "multi-select",
    celebration: { enabled: true, useAnswerImage: true },
    options: [
      { id: "a", text: "Red", correct: true },
      { id: "b", text: "Blue", correct: true },
      { id: "c", text: "Green", correct: false },
    ],
  });
  assert.deepEqual(celebrationView(many), { images: [], lines: ["Red", "Blue"], text: "Red, Blue" });
});

test("an uploaded picture wins over the answer text when the checkbox is off", () => {
  const view = celebrationView(
    question({
      celebration: { enabled: true, image: picture("card") },
      options: [
        { id: "a", text: "Paris", correct: true, media: picture("answer") },
        { id: "b", text: "Lyon", correct: false },
      ],
    }),
  );
  assert.deepEqual(view?.images, [{ media: picture("card") }]);
  assert.deepEqual(view?.lines, []);
  assert.equal(view?.text, "Paris");
});

test("a text answer's picture wins over the uploaded card picture when checked", () => {
  const view = celebrationView(
    question({
      celebration: { enabled: true, image: picture("card"), useAnswerImage: true },
      options: [
        { id: "a", text: "Paris", correct: true, media: picture("answer") },
        { id: "b", text: "Lyon", correct: false },
      ],
    }),
  );
  assert.deepEqual(view?.images, [{ media: picture("answer") }]);
  assert.deepEqual(view?.lines, []);
});

test("the answer-picture checkbox uses that picture, and falls back to text when there isn't one", () => {
  const withPicture = celebrationView(
    question({
      kind: "image-choice",
      celebration: { enabled: true, useAnswerImage: true },
      options: [
        { id: "a", text: "Paris", correct: true, media: picture("paris") },
        { id: "b", text: "Lyon", correct: false, media: picture("lyon") },
      ],
    }),
  );
  assert.deepEqual(withPicture?.images, [{ media: picture("paris") }]);
  assert.deepEqual(withPicture?.lines, []);

  const noPicture = celebrationView(
    question({ celebration: { enabled: true, useAnswerImage: true } }),
  );
  assert.deepEqual(noPicture, { images: [], lines: ["Paris"], text: "Paris" });
});

test("a choice question's prompt picture is not treated as the answer", () => {
  const view = celebrationView(
    question({
      media: picture("prompt"),
      celebration: { enabled: true, useAnswerImage: true },
    }),
  );
  assert.deepEqual(view?.images, []);
  assert.deepEqual(view?.lines, ["Paris"]);
});

test("image questions use the correct answer picture without an extra checkbox", () => {
  const image = celebrationView(
    question({
      kind: "image-choice",
      celebration: { enabled: true },
      options: [
        { id: "a", text: "Cat", correct: true, media: picture("cat") },
        { id: "b", text: "Dog", correct: false, media: picture("dog") },
      ],
    }),
  );
  assert.deepEqual(image?.images, [{ media: picture("cat") }]);
  assert.deepEqual(image?.lines, []);

});

test("Reveal repeats its uncovered picture only when selected, after the uncover finishes", () => {
  const reveal = question({
    kind: "reveal",
    reveal: { animation: "tiles", durationMs: 1800 },
    celebration: { enabled: true, image: picture("card") },
    options: [
      { id: "a", text: "Cat", correct: true, media: picture("cat") },
      { id: "b", text: "Dog", correct: false },
    ],
  });
  assert.deepEqual(celebrationView(reveal)?.images, [{ media: picture("card") }]);
  assert.equal(celebrationDelayMs(reveal), 1800);
  reveal.celebration = { ...reveal.celebration!, useAnswerImage: true };
  assert.deepEqual(celebrationView(reveal)?.images, [{ media: picture("cat") }]);

  const quiz = createQuiz("Reveal");
  quiz.questions = [reveal];
  const run = buildTimeline(quiz, { answerMode: "pick-correct", sound: false });
  assert.equal(run.questions[0].advanceAt - run.questions[0].revealAt, 1800 + 5000);
  assert.ok(run.confetti.some((cue) => cue.at - run.questions[0].revealAt === 1800 + 280));
});

test("Reveal without a card picture falls back to answer words when its checkbox is off", () => {
  const reveal = celebrationView(
    question({
      kind: "reveal",
      celebration: { enabled: true },
      options: [
        { id: "a", text: "Cat", correct: true, media: picture("cat") },
        { id: "b", text: "Dog", correct: false },
      ],
    }),
  );
  assert.deepEqual(reveal?.images, []);
  assert.deepEqual(reveal?.lines, ["Cat"]);
});

test("a text question keeps its words unless it asks to use the answer picture", () => {
  const view = celebrationView(
    question({
      celebration: { enabled: true },
      options: [
        { id: "a", text: "Paris", correct: true, media: picture("paris") },
        { id: "b", text: "Lyon", correct: false },
      ],
    }),
  );
  assert.deepEqual(view, { images: [], lines: ["Paris"], text: "Paris" });
});

test("a Reveal question can celebrate with the correct answer's picture", () => {
  const view = celebrationView(
    question({
      kind: "reveal",
      media: picture("legacy"),
      celebration: { enabled: true, useAnswerImage: true },
      options: [
        { id: "a", text: "Paris", correct: true },
        { id: "b", text: "Lyon", correct: false },
      ],
    }),
  );
  assert.deepEqual(view?.images, [{ media: picture("legacy") }]);
});

test("multi-select shows the pictures and does not write the other answers on the card", () => {
  const view = celebrationView(
    question({
      kind: "multi-select",
      celebration: { enabled: true, useAnswerImage: true },
      options: [
        { id: "a", text: "Paris", correct: true, media: picture("paris") },
        { id: "b", text: "Rome", correct: true },
        { id: "c", text: "Oslo", correct: false, media: picture("oslo") },
      ],
    }),
  );
  assert.deepEqual(view?.images, [{ media: picture("paris") }]);
  assert.deepEqual(view?.lines, []);
  assert.equal(view?.text, "Paris, Rome");
});

test("schema, copy, and media refs stay quiet unless the celebration is in use", () => {
  const base = { settings: { cues: {} }, questions: [question()], theme: {} } as unknown as Quiz;
  assert.equal(schemaVersionFor(base), 1);
  assert.equal(
    schemaVersionFor({ ...base, questions: [question({ celebration: { enabled: false, image: picture("x") } })] }),
    1,
  );
  assert.equal(schemaVersionFor({ ...base, questions: [question({ celebration: { enabled: true } })] }), 4);

  const stored = question({ celebration: { enabled: false, image: picture("card"), useAnswerImage: true } });
  const quiz = { ...base, questions: [stored] };
  assert.equal(imageRefs(quiz).some((ref) => ref.kind === "stored" && ref.id === "card"), false);
  assert.ok(collectRefs(quiz).some((ref) => ref.kind === "stored" && ref.id === "card"));
  stored.celebration = { ...stored.celebration!, enabled: true };
  assert.ok(imageRefs(quiz).some((ref) => ref.kind === "stored" && ref.id === "card"));

  const copied = remapMedia(quiz, new Map([["card", "card-2"]]));
  assert.deepEqual(copied.questions[0].celebration?.image, picture("card-2"));
  assert.equal(copied.questions[0].celebration?.useAnswerImage, true);
});

test("exported video adds confetti only when that question's celebration asks for it", () => {
  const plain = createQuiz("Plain");
  plain.questions = [question()];
  const base = buildTimeline(plain, { answerMode: "pick-correct", sound: false }).confetti.length;

  const confetti = createQuiz("Confetti");
  confetti.questions = [question({ celebration: { enabled: true, animation: "confetti" } })];
  assert.equal(buildTimeline(confetti, { answerMode: "pick-correct", sound: false }).confetti.length, base + 1);

  const stars = createQuiz("Stars");
  stars.questions = [question({ celebration: { enabled: true, animation: "stars" } })];
  assert.equal(buildTimeline(stars, { answerMode: "pick-correct", sound: false }).confetti.length, base);

  const off = createQuiz("Off");
  off.questions = [question({ celebration: { enabled: false, animation: "confetti" } })];
  assert.equal(buildTimeline(off, { answerMode: "pick-correct", sound: false }).confetti.length, base);

  const hidden = createQuiz("Hidden");
  hidden.settings.revealAfterEach = false;
  hidden.questions = [question({ celebration: { enabled: true, animation: "confetti" } })];
  const hiddenBase = createQuiz("Hidden base");
  hiddenBase.settings.revealAfterEach = false;
  hiddenBase.questions = [question()];
  assert.equal(
    buildTimeline(hidden, { answerMode: "pick-correct", sound: false }).confetti.length,
    buildTimeline(hiddenBase, { answerMode: "pick-correct", sound: false }).confetti.length,
  );
});
