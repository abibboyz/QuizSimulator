import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captionPose,
  captionProgress,
  cardFlipAngle,
  coverTravel,
  irisRadius,
  pixelBlocks,
  blurRadius,
  resolveReveal,
  revealAspect,
  revealFallbackColor,
  revealProgress,
  REVEAL_ANIMATION_IDS,
  REVEAL_ANIMATIONS,
  REVEAL_DEFAULTS,
  shatterPiece,
  tileFlipProgress,
  tileGrid,
  zoomWindow,
} from "./reveal.ts";
import { validateQuiz, type Question, type Quiz, type RevealSettings } from "../types/quiz.ts";

const revealQuestion = (over: Partial<Question> = {}): Question => ({
  id: "r1",
  kind: "reveal",
  layout: "grid",
  prompt: "Which landmark is this?",
  media: { kind: "stored", id: "answer", w: 1600, h: 900 },
  options: [
    { id: "a", text: "Eiffel Tower", correct: true },
    { id: "b", text: "Big Ben", correct: false },
    { id: "c", text: "Colosseum", correct: false },
    { id: "d", text: "Taj Mahal", correct: false },
  ],
  reveal: { animation: "shatter", cover: { kind: "stored", id: "cover", w: 800, h: 800 }, caption: "It's Paris" },
  ...over,
});

const quiz = (questions: Question[]): Quiz =>
  ({
    id: "quiz",
    title: "Reveal test",
    createdAt: 1,
    updatedAt: 1,
    schemaVersion: 2,
    theme: {} as Quiz["theme"],
    settings: {} as Quiz["settings"],
    questions,
  }) as Quiz;

/* ------------------------------------------------------------ resolution */

test("resolveReveal: a missing or empty record resolves to the defaults", () => {
  assert.deepEqual(resolveReveal({}), REVEAL_DEFAULTS);
  assert.deepEqual(resolveReveal({ reveal: {} }), REVEAL_DEFAULTS);
  assert.deepEqual(resolveReveal({ reveal: null as unknown as Partial<RevealSettings> }), REVEAL_DEFAULTS);
});

test("resolveReveal: clamps numbers and drops unknown values from hand-edited imports", () => {
  const r = resolveReveal({
    reveal: {
      animation: "constructor" as RevealSettings["animation"],
      durationMs: 5,
      tiles: 500,
      zoom: 0,
      focusX: -3,
      focusY: 9,
      sound: "toString" as RevealSettings["sound"],
      coverFallback: "sparkles" as RevealSettings["coverFallback"],
      cover: { kind: "stored" } as unknown as RevealSettings["cover"],
      caption: "   ",
    },
  });
  assert.equal(r.animation, REVEAL_DEFAULTS.animation);
  assert.equal(r.durationMs, 200);
  assert.equal(r.tiles, 16);
  assert.equal(r.zoom, 1.2);
  assert.equal(r.focusX, 0);
  assert.equal(r.focusY, 1);
  assert.equal(r.sound, REVEAL_DEFAULTS.sound);
  assert.equal(r.coverFallback, "color");
  assert.equal(r.cover, undefined);
  assert.equal(r.caption, undefined);
});

test("resolveReveal: keeps valid settings, silence, and rejects custom sounds (no file slot)", () => {
  const r = resolveReveal(revealQuestion());
  assert.equal(r.animation, "shatter");
  assert.deepEqual(r.cover, { kind: "stored", id: "cover", w: 800, h: 800 });
  assert.equal(r.caption, "It's Paris");
  assert.equal(resolveReveal({ reveal: { sound: null } }).sound, null);
  assert.equal(resolveReveal({ reveal: { sound: "custom" } }).sound, REVEAL_DEFAULTS.sound);
  assert.equal(resolveReveal({ reveal: { sound: "fanfare" } }).sound, "fanfare");
});

test("every reveal animation has catalogue info and resolves as itself", () => {
  assert.equal(REVEAL_ANIMATION_IDS.length, 13);
  for (const id of REVEAL_ANIMATION_IDS) {
    assert.ok(REVEAL_ANIMATIONS[id].label);
    assert.equal(resolveReveal({ reveal: { animation: id } }).animation, id);
  }
});

/* ------------------------------------------------------------ validation */

test("validateQuiz: a Reveal question needs an answer picture and exactly one correct answer", () => {
  assert.deepEqual(validateQuiz(quiz([revealQuestion()])), []);

  const noPicture = validateQuiz(quiz([revealQuestion({ media: undefined })]));
  assert.ok(noPicture.some((i) => /answer picture to reveal/.test(i.message)));

  const twoCorrect = revealQuestion();
  twoCorrect.options[1] = { ...twoCorrect.options[1], correct: true };
  assert.ok(validateQuiz(quiz([twoCorrect])).some((i) => /exactly one correct/.test(i.message)));

  const noneCorrect = revealQuestion();
  noneCorrect.options = noneCorrect.options.map((o) => ({ ...o, correct: false }));
  assert.ok(validateQuiz(quiz([noneCorrect])).some((i) => /no correct answer/.test(i.message)));
});

/* ----------------------------------------------------------- persistence */

test("a Reveal question survives a JSON round trip (save / export / import) unchanged", () => {
  const q = revealQuestion({ reveal: { ...revealQuestion().reveal, durationMs: 1800, tiles: 9, sound: null } });
  const back = JSON.parse(JSON.stringify(quiz([q]))) as Quiz;
  assert.deepEqual(back.questions[0], q);
  assert.deepEqual(resolveReveal(back.questions[0]), resolveReveal(q));
});

/* ----------------------------------------------------- pure progress f(t) */

test("revealProgress is a pure, clamped, monotonic function of elapsed time", () => {
  assert.equal(revealProgress(null, 1200), 0);
  assert.equal(revealProgress(-50, 1200), 0);
  assert.equal(revealProgress(0, 1200), 0);
  assert.equal(revealProgress(600, 1200), 0.5);
  assert.equal(revealProgress(1200, 1200), 1);
  assert.equal(revealProgress(Infinity, 1200), 1);
  let prev = -1;
  for (let t = 0; t <= 1300; t += 7) {
    const p = revealProgress(t, 1200);
    assert.equal(p, revealProgress(t, 1200), "same t, same p");
    assert.ok(p >= prev);
    prev = p;
  }
});

test("reveal geometry starts hidden, ends fully uncovered, and never runs backwards", () => {
  const steps = Array.from({ length: 101 }, (_, i) => i / 100);
  const { cols, rows } = tileGrid(6, 16 / 9);
  assert.deepEqual({ cols, rows }, { cols: 6, rows: 3 });
  assert.equal(tileGrid(4, 0.5).rows, 8, "portrait pictures get more rows");
  assert.equal(tileGrid(4, NaN).rows, 3, "unknown aspect falls back to 4:3");

  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      assert.equal(tileFlipProgress(0, c, r, cols, rows), 0);
      assert.equal(tileFlipProgress(1, c, r, cols, rows), 1);
      let prev = -1;
      for (const p of steps) {
        const v = tileFlipProgress(p, c, r, cols, rows);
        assert.ok(v >= prev - 1e-12);
        prev = v;
      }
    }
  }

  assert.ok(pixelBlocks(0, 6, 400) === 6);
  assert.equal(pixelBlocks(1, 6, 400), 0, "sharp at the end");
  assert.ok(blurRadius(0, 400, 300) > 20);
  assert.equal(blurRadius(1, 400, 300), 0);

  assert.deepEqual(zoomWindow(1, 4, 0.2, 0.8), { x: 0, y: 0, w: 1, h: 1 });
  const start = zoomWindow(0, 4, 0.9, 0.1);
  assert.equal(start.w, 0.25);
  assert.ok(start.x >= 0 && start.x + start.w <= 1 && start.y >= 0 && start.y + start.h <= 1, "stays inside");

  assert.equal(coverTravel(0), 0);
  assert.equal(coverTravel(1), 1);
  assert.equal(irisRadius(0), 0);
  assert.equal(irisRadius(1), 1);
  assert.equal(cardFlipAngle(0), 0);
  assert.equal(cardFlipAngle(1), 180);
});

test("shatter pieces are seeded: the same piece at the same t always breaks the same way", () => {
  for (const p of [0, 0.3, 0.7, 1]) {
    assert.deepEqual(shatterPiece(p, 2, 1, 6, 4), shatterPiece(p, 2, 1, 6, 4));
  }
  const still = shatterPiece(0, 2, 1, 6, 4);
  assert.equal(still.opacity, 1);
  assert.ok(Math.abs(still.dx) < 1e-9 && Math.abs(still.dy) < 1e-9);
  assert.ok(shatterPiece(1, 2, 1, 6, 4).opacity < 0.05, "gone by the end");
});

test("the caption pops in only after the uncover finishes", () => {
  assert.equal(captionProgress(null, 1200, 280), 0);
  assert.equal(captionProgress(1200, 1200, 280), 0);
  assert.equal(captionProgress(1340, 1200, 280), 0.5);
  assert.equal(captionPose(600, 1200).opacity, 0);
  assert.deepEqual(captionPose(2000, 1200), { opacity: 1, y: 0, scale: 1 });
});

test("revealAspect: decoded size, else the stored size, else 4:3", () => {
  assert.equal(revealAspect({ kind: "stored", id: "x", w: 1000, h: 500 }), 2);
  assert.equal(revealAspect({ kind: "stored", id: "x", w: 1000, h: 500 }, { width: 300, height: 600 }), 0.5);
  assert.equal(revealAspect({ kind: "url", url: "https://example.com/a.png" }), 4 / 3);
  assert.equal(revealAspect({ kind: "stored", id: "x", w: 0, h: 0 }), 4 / 3);
  assert.equal(revealAspect(undefined), 4 / 3);
});

test("revealFallbackColor darkens the accent deterministically", () => {
  assert.equal(revealFallbackColor("#ff0000"), revealFallbackColor("#ff0000"));
  assert.notEqual(revealFallbackColor("#ff0000"), "#ff0000");
});
