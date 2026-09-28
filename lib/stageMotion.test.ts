import assert from "node:assert/strict";
import { test } from "node:test";
import {
  answerDelayMs,
  answerPoseAt,
  customExitMs,
  DEFAULT_ANSWER_MOTION,
  DEFAULT_MOTION,
  DEFAULT_QUESTION_MOTION,
  ENTER_EFFECTS,
  enterPose,
  enterSpanMs,
  EXIT_EFFECTS,
  exitPhaseMs,
  exitPose,
  isDefaultMotion,
  isRestPose,
  poseStyle,
  questionPoseAt,
  resetToGlobal,
  resolveMotion,
  REST_POSE,
  swapOutDelayMs,
  typewriterChars,
  usesGlobal,
  usesSwapIn,
  usesSwapOut,
} from "./stageMotion.ts";
import { QUESTION_SWAP, TILE_IN, tileDelayMs } from "./playTiming.ts";
import { cubicBezier, lerp } from "./videoExport/motion.ts";
import type { ElementMotion, MotionOverrides, Question, QuizSettings } from "../types/quiz.ts";

const q = (motion?: MotionOverrides): Question => ({
  id: "q",
  kind: "multiple-choice",
  layout: "grid",
  prompt: "What is the capital of France?",
  options: [
    { id: "a", text: "Paris", correct: true },
    { id: "b", text: "Rome", correct: false },
    { id: "c", text: "Madrid", correct: false },
    { id: "d", text: "Berlin", correct: false },
  ],
  ...(motion ? { motion } : {}),
});

const settings = (motion?: MotionOverrides) => ({ motion }) as Pick<QuizSettings, "motion">;

/* -------------------------------------------------- backward compatibility */

test("back-compat: a quiz and question saved before animations existed resolve to today's motion", () => {
  // An old quiz: no settings.motion, no question.motion (keys absent, not undefined).
  const old = JSON.parse(JSON.stringify(q())) as Question;
  assert.equal("motion" in old, false);
  assert.deepEqual(resolveMotion({} as QuizSettings, old), DEFAULT_MOTION);
  assert.deepEqual(resolveMotion(undefined, old), DEFAULT_MOTION);
  assert.deepEqual(resolveMotion(undefined), DEFAULT_MOTION);
  assert.ok(isDefaultMotion(resolveMotion(undefined, old)));
});

test("back-compat: default motion keeps the stage swap and its exact 200ms exit phase", () => {
  assert.equal(usesSwapIn(DEFAULT_MOTION), true);
  assert.equal(usesSwapOut(DEFAULT_MOTION), true);
  assert.equal(exitPhaseMs(DEFAULT_MOTION, 4), QUESTION_SWAP.durationS * 1000);
  assert.equal(swapOutDelayMs(DEFAULT_MOTION, 4), 0);
  assert.equal(customExitMs(DEFAULT_MOTION, 4), 0);
  assert.equal(enterSpanMs(DEFAULT_MOTION, 4, "prompt"), 0, "no animation clock runs for defaults");
});

test("back-compat: default poses are exactly today's look (question at rest, tiles = .animate-tile-in)", () => {
  const ease = cubicBezier(TILE_IN.ease);
  for (let t = -50; t <= 800; t += 5) {
    assert.equal(questionPoseAt(DEFAULT_QUESTION_MOTION, t, null), REST_POSE);
    assert.equal(questionPoseAt(DEFAULT_QUESTION_MOTION, t, t / 2), REST_POSE, "default exit is the stage swap");
    for (let i = 0; i < 6; i++) {
      // The tile-in formula the CSS keyframes (and #3's exporter) use.
      const e = ease(Math.min(1, Math.max(0, (t - tileDelayMs(i)) / TILE_IN.durationMs)));
      const pose = answerPoseAt(DEFAULT_ANSWER_MOTION, i, t, null);
      assert.equal(pose.opacity, e);
      assert.equal(pose.y, 10 * (1 - e));
      assert.equal(pose.scale, lerp(0.97, 1, e));
      assert.equal(pose.x, 0);
      assert.equal(pose.rotateX, 0);
      assert.equal(answerDelayMs(DEFAULT_ANSWER_MOTION, i), tileDelayMs(i));
    }
  }
  assert.equal(poseStyle(questionPoseAt(DEFAULT_QUESTION_MOTION, 0, null)), undefined, "no inline style at rest");
});

/* ------------------------------------------------- global + per-question */

test("resolveMotion: quiz-wide settings apply to every question without overrides", () => {
  const global = settings({ question: { enter: "typewriter" }, answers: { enter: "pop", staggerMs: 90 } });
  const r = resolveMotion(global, q());
  assert.equal(r.question.enter, "typewriter");
  assert.equal(r.question.exit, "default");
  assert.equal(r.answers.enter, "pop");
  assert.equal(r.answers.staggerMs, 90);
  assert.equal(r.answers.durationMs, DEFAULT_ANSWER_MOTION.durationMs, "unset fields fall back to defaults");
});

test("resolveMotion: a question override wins field by field over the quiz setting", () => {
  const global = settings({ answers: { enter: "pop", exit: "fade", durationMs: 600 } });
  const r = resolveMotion(global, q({ answers: { enter: "slide-left" } }));
  assert.equal(r.answers.enter, "slide-left");
  assert.equal(r.answers.exit, "fade");
  assert.equal(r.answers.durationMs, 600);
  assert.equal(r.question.enter, "default", "the other element still follows the quiz");
});

test("usesGlobal / resetToGlobal: one element, both elements, and back to exactly the quiz's motion", () => {
  const global = settings({ question: { enter: "fade" } });
  const both = q({ question: { enter: "bounce" }, answers: { exit: "zoom" } });
  assert.equal(usesGlobal(both, "question"), false);
  assert.equal(usesGlobal(both, "answers"), false);

  const one = resetToGlobal(both, "question");
  assert.equal(usesGlobal(one, "question"), true);
  assert.equal(usesGlobal(one, "answers"), false);
  assert.equal(resolveMotion(global, one).question.enter, "fade");
  assert.equal(resolveMotion(global, one).answers.exit, "zoom");

  const none = resetToGlobal(one, "answers");
  assert.equal("motion" in none, false, "last override removed drops the key entirely");
  assert.deepEqual(resolveMotion(global, none), resolveMotion(global, q()));

  const all = resetToGlobal(both);
  assert.equal("motion" in all, false);
  assert.deepEqual(resolveMotion(global, all), resolveMotion(global, q()));
  assert.equal(usesGlobal(q({ question: {} }), "question"), true, "an empty override counts as global");
});

test("resolveMotion sanitises imports: unknown effects, typewriter on answers, out-of-range numbers", () => {
  const r = resolveMotion(
    settings({
      question: {
        enter: "spin" as ElementMotion["enter"],
        durationMs: 99999,
        easing: "wobble" as ElementMotion["easing"],
      },
      answers: { enter: "typewriter", staggerMs: -40, durationMs: 1 },
    }),
  );
  assert.equal(r.question.enter, "default");
  assert.equal(r.question.durationMs, 3000);
  assert.equal(r.question.easing, "smooth");
  assert.equal(r.answers.enter, "default", "typewriter is text-only");
  assert.equal(r.answers.staggerMs, 0);
  assert.equal(r.answers.durationMs, 100);
});

/* ------------------------------------------------------ custom effect timing */

test("custom exits play before the stage swap-out; custom question exits replace it", () => {
  const answersOut: typeof DEFAULT_MOTION = {
    ...DEFAULT_MOTION,
    answers: { ...DEFAULT_ANSWER_MOTION, exit: "fade", durationMs: 300, staggerMs: 50 },
  };
  assert.equal(customExitMs(answersOut, 4), 3 * 50 + 300);
  assert.equal(swapOutDelayMs(answersOut, 4), 450);
  assert.equal(exitPhaseMs(answersOut, 4), 450 + 200);

  const questionOut: typeof DEFAULT_MOTION = {
    ...DEFAULT_MOTION,
    question: { ...DEFAULT_QUESTION_MOTION, exit: "zoom", durationMs: 500 },
  };
  assert.equal(usesSwapOut(questionOut), false);
  assert.equal(exitPhaseMs(questionOut, 4), 500);

  const noneOut: typeof DEFAULT_MOTION = { ...DEFAULT_MOTION, question: { ...DEFAULT_QUESTION_MOTION, exit: "none" } };
  assert.equal(exitPhaseMs(noneOut, 4), 0, "'none' disappears instantly");
  assert.equal(usesSwapIn({ ...DEFAULT_MOTION, question: { ...DEFAULT_QUESTION_MOTION, enter: "fade" } }), false);
});

test("typewriter types a character count that is a pure function of time", () => {
  const m: ElementMotion = { ...DEFAULT_QUESTION_MOTION, enter: "typewriter", durationMs: 300 };
  const text = "What is the capital of France?"; // 30 chars → 900ms at 30ms/char
  assert.equal(typewriterChars(text, m, 0), 0);
  assert.equal(typewriterChars(text, m, 450), 15);
  assert.equal(typewriterChars(text, m, 900), 30);
  assert.equal(typewriterChars(text, m, 5000), 30);
  assert.equal(typewriterChars(text, { ...m, enter: "fade" }, 0), 30, "other entrances show it all");
  assert.equal(enterSpanMs({ ...DEFAULT_MOTION, question: m }, 4, text), 900);
});

/* ------------------------------------------------------------ determinism */

test("every entrance and exit is deterministic, starts/ends at rest, and stays finite", () => {
  const easings = ["smooth", "linear", "ease-in-out", "ease-out", "snappy"] as const;
  for (const easing of easings) {
    for (const { id } of ENTER_EFFECTS) {
      assert.ok(isRestPose(enterPose(id, 1, easing)), `${id} ends at rest`);
      for (let r = -0.2; r <= 1.2; r += 0.05) {
        const a = enterPose(id, r, easing);
        assert.deepEqual(a, enterPose(id, r, easing));
        for (const v of Object.values(a)) assert.ok(Number.isFinite(v));
        assert.ok(a.opacity >= 0 && a.opacity <= 1);
      }
    }
    for (const { id } of EXIT_EFFECTS) {
      assert.ok(isRestPose(exitPose(id, 0, easing)), `${id} starts at rest`);
      const end = exitPose(id, 1, easing);
      if (id !== "default" && id !== "none") assert.equal(end.opacity, 0, `${id} ends invisible`);
      for (let r = 0; r <= 1; r += 0.05) assert.deepEqual(exitPose(id, r, easing), exitPose(id, r, easing));
    }
  }
});

test("custom answer poses stagger and are the same for the same (index, t)", () => {
  const m: ElementMotion = {
    enter: "slide-up",
    exit: "slide-down",
    durationMs: 400,
    easing: "ease-out",
    staggerMs: 80,
  };
  assert.equal(answerPoseAt(m, 2, 160, null).opacity, 0, "tile 3 hasn't started at 160ms");
  assert.ok(answerPoseAt(m, 0, 160, null).opacity > 0);
  assert.ok(isRestPose(answerPoseAt(m, 3, 3 * 80 + 400, null)));
  assert.deepEqual(answerPoseAt(m, 1, 237, 55), answerPoseAt(m, 1, 237, 55));
  assert.equal(answerPoseAt(m, 0, 5000, 400).opacity, 0, "gone after its exit");
});
