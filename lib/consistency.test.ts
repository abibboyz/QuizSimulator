/**
 * Cross-surface consistency: the builder, live play, host and the video
 * exporter all read animation and Reveal settings through the same resolvers.
 * These tests pin that down end to end (quiz → timeline) and round-trip every
 * new field through the JSON a save or export writes.
 *
 * Needs the "@/…" alias hooks (`npm test` registers scripts/test-alias.mjs).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import type { MediaRef, Question, Quiz } from "../types/quiz.ts";
import { schemaVersionFor, validateQuiz } from "../types/quiz.ts";
import { DEFAULT_MOTION, resetToGlobal, resolveMotion, usesGlobal } from "./stageMotion.ts";
import { normalizeRevealQuestion, resolveReveal, revealAnswerMedia } from "./reveal.ts";
import { collectRefs, remapMedia } from "./mediaRefs.ts";
import { buildTimeline } from "./videoExport/timeline.ts";
import { convertKind, createQuestion, createQuiz, duplicateQuestion } from "./factory.ts";

const pic = (id: string, w = 800, h = 600): MediaRef => ({ kind: "stored", id, w, h });

function revealQuestion(id: string, over: Partial<Question> = {}): Question {
  return {
    id,
    kind: "reveal",
    layout: "grid",
    prompt: `Which one? (${id})`,
    optionGap: 12,
    options: ["a", "b", "c", "d"].map((o, i) => ({
      id: `${id}-${o}`,
      text: o.toUpperCase(),
      correct: i === 1,
      media: pic(`${id}-${o}`, i % 2 ? 450 : 900, i % 2 ? 700 : 400),
    })),
    reveal: { animation: "iris", cover: pic(`${id}-cover`, 600, 600), caption: "It's B", durationMs: 1500 },
    ...over,
  };
}

function mcQuestion(id: string, over: Partial<Question> = {}): Question {
  return {
    id,
    kind: "multiple-choice",
    layout: "grid",
    prompt: `Question ${id}`,
    options: [0, 1, 2, 3].map((i) => ({ id: `${id}-${i}`, text: `Option ${i}`, correct: i === 0 })),
    ...over,
  };
}

function quizWith(questions: Question[], motion?: Quiz["settings"]["motion"]): Quiz {
  const base = createQuiz("Consistency");
  return {
    ...base,
    settings: { ...base.settings, cues: {}, timerSeconds: 5, ...(motion ? { motion } : {}) },
    questions,
  };
}

const GLOBAL = {
  question: { enter: "typewriter", durationMs: 600 },
  answers: { enter: "pop", exit: "fade", durationMs: 450, staggerMs: 80 },
} as const;

test("export timeline resolves exactly the motion the builder and live play resolve, per question", () => {
  const overridden = mcQuestion("q2", {
    motion: { question: { enter: "slide-left", exit: "zoom" }, answers: { enter: "bounce", easing: "snappy" } },
  });
  const reset = resetToGlobal(mcQuestion("q3", { motion: { answers: { enter: "flip" } } }));
  const fresh = { ...createQuestion("reveal"), options: revealQuestion("q4").options };
  const quiz = quizWith([revealQuestion("q1"), overridden, reset, fresh], structuredClone(GLOBAL));
  const timeline = buildTimeline(quiz, { answerMode: "pick-correct", sound: true });

  const global = resolveMotion(quiz.settings);
  timeline.questions.forEach((run, i) => {
    assert.deepEqual(run.motion, resolveMotion(quiz.settings, quiz.questions[i]), `question ${i + 1}`);
  });
  assert.equal(timeline.questions[1].motion.question.enter, "slide-left");
  assert.equal(timeline.questions[1].motion.answers.staggerMs, 80, "unset override fields fall back to the quiz");
  // Reset to global leaves no key behind, and plays exactly as the quiz does.
  assert.equal("motion" in reset, false);
  assert.ok(usesGlobal(reset, "question") && usesGlobal(reset, "answers"));
  assert.deepEqual(timeline.questions[2].motion, global);
  // New questions carry no overrides, so they inherit the quiz's animations.
  assert.equal("motion" in fresh, false);
  assert.deepEqual(timeline.questions[3].motion, global);
});

test("a quiz with no animation settings exports today's motion on every question", () => {
  const quiz = quizWith([mcQuestion("a"), revealQuestion("b")]);
  const timeline = buildTimeline(quiz, { answerMode: "timeout", sound: false });
  for (const run of timeline.questions) assert.deepEqual(run.motion, DEFAULT_MOTION);
});

test("the export's reveal sound lands on the reveal, and only for Reveal questions", () => {
  const quiz = quizWith([mcQuestion("a"), revealQuestion("b")]);
  const timeline = buildTimeline(quiz, { answerMode: "pick-correct", sound: true });
  const [mc, rv] = timeline.questions;
  const at = (t: number) =>
    timeline.audio.filter((e) => e.at === t && "recipe" in e).map((e) => ("recipe" in e ? e.recipe : ""));
  assert.ok(at(rv.revealAt).includes("reveal"), JSON.stringify(at(rv.revealAt)));
  assert.ok(!at(mc.revealAt).includes("reveal"));
});

test("the next clock waits out custom exits, and default motion keeps today's timing", () => {
  const plain = buildTimeline(quizWith([mcQuestion("a"), mcQuestion("b")]), { answerMode: "timeout", sound: false });
  // Today's look: the clock starts as the 200ms swap begins, i.e. at the swap itself.
  assert.equal(plain.questions[1].liveAt, plain.questions[0].exitAt);
  assert.equal(plain.questions[1].mountAt, plain.questions[0].exitAt + 200);

  const leaving = mcQuestion("a", { motion: { question: { exit: "zoom" }, answers: { exit: "fade" } } });
  const custom = buildTimeline(quizWith([leaving, mcQuestion("b")], structuredClone(GLOBAL)), {
    answerMode: "timeout",
    sound: false,
  });
  const [first, second] = custom.questions;
  const exits = first.swapOutDelayMs;
  assert.ok(exits > 0);
  assert.equal(second.liveAt, first.exitAt + exits, "no timer time is spent while the old question is leaving");
  assert.ok(second.liveAt <= second.mountAt);
  // Everything else still keys off liveAt: the next timeout lands a full timer after it.
  assert.equal(second.revealAt - second.liveAt, 5000);
});

test("duplicating copies overrides and reveal settings instead of sharing them", () => {
  const original = revealQuestion("d", { motion: { answers: { enter: "bounce" } } });
  const copy = duplicateQuestion(original);
  assert.deepEqual(resolveMotion(undefined, copy), resolveMotion(undefined, original));
  assert.deepEqual(resolveReveal(copy), resolveReveal(original));
  copy.motion!.answers!.enter = "flip";
  copy.reveal!.animation = "tiles";
  assert.equal(original.motion!.answers!.enter, "bounce");
  assert.equal(original.reveal!.animation, "iris");
  // Switching kind away and back keeps both.
  const back = convertKind(convertKind(original, "multiple-choice"), "reveal");
  assert.deepEqual(back.motion, original.motion);
  assert.deepEqual(back.reveal, original.reveal);
});

test("round trip: every new field survives save/export JSON and media remapping", () => {
  const quiz = quizWith(
    [
      revealQuestion("r1", {
        motion: { question: { enter: "fade", exit: "slide-up", durationMs: 700 }, answers: { enter: "flip" } },
      }),
      revealQuestion("r2", {
        reveal: { animation: "tiles", coverFallback: "color", coverColor: "#223355", tiles: 8, sound: null },
      }),
      revealQuestion("r3", {
        reveal: { animation: "zoom", coverFallback: "blur", zoom: 3, focusX: 0.2, focusY: 0.8, caption: "Zoomed" },
      }),
    ],
    structuredClone(GLOBAL),
  );
  const saved: Quiz = JSON.parse(JSON.stringify(quiz));
  assert.deepEqual(saved, quiz);
  assert.equal(schemaVersionFor(saved), 2);
  assert.deepEqual(validateQuiz(saved), []);
  // Loading normalizes Reveal questions; the current model is left untouched.
  assert.deepEqual(saved.questions.map(normalizeRevealQuestion), quiz.questions);

  // Every picture a bundle has to carry: 12 answers + the one cover (r2/r3 have no cover set).
  const refs = collectRefs(saved).map((r) => (r.kind === "stored" ? r.id : r.url));
  for (const q of quiz.questions) for (const o of q.options) assert.ok(refs.includes((o.media as { id: string }).id));
  assert.ok(refs.includes("r1-cover"));

  // Import remaps ids; covers and answers follow, settings don't change.
  const remap = new Map(refs.map((id) => [id, `new-${id}`]));
  const imported = remapMedia(saved, remap);
  const r1 = imported.questions[0];
  assert.deepEqual(resolveReveal(r1).cover, { ...pic("new-r1-cover", 600, 600) });
  assert.equal((revealAnswerMedia(r1, r1.options[1]) as { id: string }).id, "new-r1-b");
  assert.deepEqual(
    imported.questions.map((q) => ({ ...q.reveal, cover: undefined })),
    quiz.questions.map((q) => ({ ...q.reveal, cover: undefined })),
  );
  assert.deepEqual(imported.settings.motion, quiz.settings.motion);
  assert.deepEqual(
    imported.questions.map((q) => q.motion),
    quiz.questions.map((q) => q.motion),
  );
});

test("round trip: older files still load — v1 quizzes unchanged, #4-era Reveal pictures move onto the correct answer", () => {
  const v1 = quizWith([mcQuestion("old1", { media: pic("prompt") }), mcQuestion("old2")]);
  delete (v1.settings as Partial<Quiz["settings"]>).motion;
  const loaded: Quiz = JSON.parse(JSON.stringify(v1));
  assert.equal(schemaVersionFor(loaded), 1);
  assert.deepEqual(loaded.questions.map(normalizeRevealQuestion), v1.questions);
  // (remapMedia writes explicit `undefined`s, which JSON drops: compare what gets saved.)
  assert.deepEqual(JSON.parse(JSON.stringify(remapMedia(loaded, new Map()))), loaded);

  // A Reveal question saved before answers had pictures: one picture on the question.
  const legacy: Question = {
    ...revealQuestion("leg"),
    media: pic("answer"),
    options: revealQuestion("leg").options.map((o) => ({ ...o, media: undefined })),
  };
  const normalized = normalizeRevealQuestion(JSON.parse(JSON.stringify(legacy)));
  assert.equal(normalized.media, undefined);
  assert.deepEqual(normalized.options[1].media, pic("answer"));
  assert.deepEqual(normalizeRevealQuestion(normalized), normalized, "normalizing twice changes nothing");
});
