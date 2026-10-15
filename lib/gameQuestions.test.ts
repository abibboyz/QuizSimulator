import assert from "node:assert/strict";
import { test } from "node:test";
import { GAME_KIND_LIST, SCHEMA_VERSION, schemaVersionFor, validateQuiz, type MediaRef, type Question, type Quiz } from "../types/quiz.ts";
import { convertKind, createQuestion, createQuiz, duplicateQuestion } from "./factory.ts";
import { collectRefs, imageRefs, questionMediaRefs, remapMedia, remapQuestionMedia } from "./mediaRefs.ts";
import { usePlaySession } from "./store/playSession.ts";
import { legacyQuiz } from "./videoExport/legacyFixture.ts";
import { INITIAL_STARS } from "./stars.ts";

const ref = (id: string): MediaRef => ({ kind: "stored", id, w: 64, h: 64 });
const quizOf = (...questions: Question[]): Quiz => ({ ...createQuiz("t"), questions });
const opts = (n: number, correct: number[]) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, text: `O${i}`, correct: correct.includes(i) }));
const q = (kind: Question["kind"], correct: number[], id = kind as string, n = 4): Question => ({ id, kind, layout: "grid", prompt: "p", options: opts(n, correct) });

/* ----------------------------------------------------------- schema / migration */

test("schema: version 11 carries the game kinds, and only a game kind raises the stamp", () => {
  assert.equal(SCHEMA_VERSION, 11);
  assert.equal(schemaVersionFor(legacyQuiz()), 2, "an existing quiz keeps the stamp it always had (so older builds still open it)");
  for (const kind of GAME_KIND_LIST) assert.equal(schemaVersionFor(quizOf(q(kind, kind === "sequence" ? [0, 1, 2, 3] : [0]))), 11, kind);
  // Leftover game settings on a classic question (e.g. after switching kind back) do not change the stamp.
  const leftover = { ...legacyQuiz().questions[0], game: { rememberMs: 5000 } } as Question;
  assert.equal(schemaVersionFor({ ...legacyQuiz(), questions: [leftover] }), schemaVersionFor({ ...legacyQuiz(), questions: [legacyQuiz().questions[0]] }));
});

test("migration: a quiz saved before the game kinds validates and round-trips untouched", () => {
  const old = legacyQuiz();
  assert.deepEqual(validateQuiz(old), []);
  const copy = JSON.parse(JSON.stringify(old)) as Quiz;
  assert.equal(JSON.stringify(remapMedia(old, new Map([["nope", "x"]]))), JSON.stringify(copy), "remapping leaves it byte-identical");
  assert.deepEqual(remapMedia(old, new Map([["pic", "pic2"]])).questions.map((x) => x.id), old.questions.map((x) => x.id));
  for (const question of old.questions) assert.equal(question.game, undefined);
  assert.ok(old.schemaVersion <= SCHEMA_VERSION, "import accepts it");
});

test("validation: game questions need two answers; sequence needs no tick; the others need a correct answer", () => {
  assert.deepEqual(validateQuiz(quizOf(q("memory-flip", [1]))), []);
  assert.deepEqual(validateQuiz(quizOf(q("sequence", [0, 1, 2, 3]))), []);
  assert.notDeepEqual(validateQuiz(quizOf(q("pop-match", []))), [], "no correct answer");
  assert.notDeepEqual(validateQuiz(quizOf(q("drag-match", [0], "d", 1))), [], "one answer is not a game");
});

/* ------------------------------------------------------------------ factory */

test("createQuestion: each game kind starts valid; sequence starts in its authored order", () => {
  for (const kind of GAME_KIND_LIST) {
    const question = createQuestion(kind);
    question.prompt = "x";
    question.options.forEach((o, i) => (o.text = `A${i}`));
    assert.equal(question.options.length, 4);
    assert.deepEqual(validateQuiz(quizOf(question)), [], kind);
  }
  assert.ok(createQuestion("sequence").options.every((o) => o.correct));
});

test("convertKind: into and out of game kinds keeps the answers and a sensible key", () => {
  const mc = q("multiple-choice", [2]);
  assert.deepEqual(convertKind(mc, "drag-match").options.map((o) => o.correct), [false, false, true, false]);
  assert.ok(convertKind(mc, "sequence").options.every((o) => o.correct));
  const back = convertKind(convertKind(mc, "sequence"), "multiple-choice");
  assert.equal(back.options.filter((o) => o.correct).length, 1, "leaving sequence keeps a single correct answer");
  const pop = convertKind(q("multi-select", [0, 1]), "pop-match");
  assert.equal(pop.options.filter((o) => o.correct).length, 2, "pop keeps several");
  assert.equal(convertKind(q("multi-select", [0, 1]), "drag-match").options.filter((o) => o.correct).length, 1, "drag keeps one");
  assert.ok(convertKind({ ...mc, options: opts(1, [0]) }, "memory-flip").options.length >= 2, "padded to two answers");
});

test("duplicateQuestion keeps the game settings (including a custom handle)", () => {
  const question: Question = { ...q("drag-match", [0]), game: { dragItem: "🍎", dragHandle: { kind: "custom", image: ref("h") } } };
  const copy = duplicateQuestion(question);
  assert.notEqual(copy.id, question.id);
  assert.deepEqual(copy.game, question.game);
});

/* ---------------------------------------------------------------- media refs */

test("a custom drag handle image is collected, exported and remapped (and defaults need no stored media)", () => {
  const custom: Question = { ...q("drag-match", [0]), game: { dragHandle: { kind: "custom", image: ref("handle") } } };
  const quiz = quizOf(custom);
  assert.ok(collectRefs(quiz).some((r) => r.kind === "stored" && r.id === "handle"), "kept by GC and export");
  assert.ok(imageRefs(quiz).some((r) => r.kind === "stored" && r.id === "handle"), "preloaded for play and video");
  assert.ok(questionMediaRefs(custom).some((r) => r.kind === "stored" && r.id === "handle"), "copied with the question");
  const out = remapMedia(quiz, new Map([["handle", "handle2"]]));
  assert.deepEqual(out.questions[0].game?.dragHandle?.image, ref("handle2"));
  assert.deepEqual(remapQuestionMedia(custom, new Map([["handle", "h3"]])).game?.dragHandle?.image, ref("h3"));
  const stick = quizOf({ ...q("drag-match", [0]), game: { dragHandle: { kind: "stick" } } });
  assert.deepEqual(collectRefs(stick).filter((r) => r.kind === "stored"), [], "the shipped Stick/Hand are same-origin files, not stored media");
  assert.ok(imageRefs(stick).some((r) => r.kind === "url" && r.url === "/drag-handles/stick.svg"), "but they are preloaded");
});

/* --------------------------------------------------------------- play session */

const play = usePlaySession;
function startWith(...questions: Question[]) {
  play.getState().reset();
  play.getState().start(quizOf(...questions));
  play.getState().begin(false);
}

test("session: sequence taps toggle in order, and only the exact order is correct", () => {
  startWith(q("sequence", [0, 1, 2, 3]));
  const s = () => play.getState();
  for (const id of ["o0", "o1", "o2", "o3"]) s().toggle(id);
  assert.deepEqual(s().selected, ["o0", "o1", "o2", "o3"]);
  s().toggle("o1");
  assert.deepEqual(s().selected, ["o0"], "tapping a picked answer drops it and everything after");
  for (const id of ["o1", "o2", "o3"]) s().toggle(id);
  s().submit(1000);
  assert.equal(s().answers[0].correct, true);
  startWith(q("sequence", [0, 1, 2, 3]));
  for (const id of ["o1", "o0", "o2", "o3"]) s().toggle(id);
  s().submit(1000);
  assert.equal(s().answers[0].correct, false);
});

test("session: pop/memory with several correct answers are pick-all; drag is a single pick", () => {
  startWith(q("pop-match", [0, 1]));
  play.getState().toggle("o0");
  play.getState().toggle("o1");
  assert.deepEqual(play.getState().selected, ["o0", "o1"]);
  play.getState().submit(500);
  assert.equal(play.getState().answers[0].correct, true);
  startWith(q("drag-match", [2]));
  play.getState().toggle("o1");
  play.getState().toggle("o2");
  assert.deepEqual(play.getState().selected, ["o2"]);
});

test("session: classic questions never get stars or star state", () => {
  startWith(...legacyQuiz().questions);
  play.getState().toggle(play.getState().order[0].options[0].id);
  play.getState().submit(500);
  const a = play.getState().answers[0];
  assert.equal(a.stars, undefined);
  assert.deepEqual(play.getState().stars, INITIAL_STARS);
});

test("session: star-collect — correct answer fills the pot, Star banks, Go carries (and counts x2), wrong loses it", () => {
  const star = (id: string): Question => ({ ...q("star-collect", [0], id), game: { stars: 2 } });
  startWith(star("s1"), star("s2"), star("s3"), star("s4"));
  const s = () => play.getState();
  s().toggle("o0"); s().submit(500);
  assert.deepEqual([s().answers[0].stars, s().stars.pot], [2, 2]);
  s().chooseStar("go");
  assert.deepEqual(s().stars, { pot: 2, banked: 0, goStreak: 1 });
  s().chooseStar("star"); // a second choice is ignored
  assert.equal(s().answers[0].starChoice, "go");
  s().next();
  s().toggle("o0"); s().submit(500);
  assert.equal(s().answers[1].stars, 4, "x2 after one Go");
  s().chooseStar("star");
  assert.deepEqual(s().stars, { pot: 0, banked: 6, goStreak: 0 });
  s().next();
  s().toggle("o1"); s().submit(500); // wrong
  assert.deepEqual([s().answers[2].stars, s().stars.pot], [0, 0]);
  s().next();
  s().toggle("o0"); s().submit(500);
  s().next(); // no choice on the last question: banked at the end
  assert.equal(s().phase, "results");
  assert.deepEqual(s().stars, { pot: 0, banked: 8, goStreak: 0 });
  assert.equal(s().answers[3].starChoice, "star", "no choice counts as Star");
});

test("session: a sequence is never reshuffled when answers are shuffled (its order is the answer)", () => {
  const quiz = quizOf(q("sequence", [0, 1, 2, 3]));
  quiz.settings.shuffleOptions = true;
  for (let i = 0; i < 10; i++) {
    play.getState().start(quiz);
    assert.deepEqual(play.getState().order[0].options.map((o) => o.id), ["o0", "o1", "o2", "o3"]);
  }
});

/* ----------------------------------------------------------- star points */

const starQ = (id: string, stars = 2): Question => ({ ...q("star-collect", [0], id), game: { stars } });
const answer = (id: string, ok: boolean) => { play.getState().toggle(ok ? "o0" : "o1"); play.getState().submit(500); void id; };
const pointsOf = (quiz: Quiz) => {
  // The score of a run where every question is answered right, one tick after the other.
  play.getState().start(quiz); play.getState().begin(false);
  for (let i = 0; i < quiz.questions.length; i++) { play.getState().toggle("o0"); play.getState().submit(500); play.getState().next(); }
  return play.getState().score;
};

test("star points: Star banks the pot into the score at 100 a star (pointsBase 1000)", () => {
  startWith(starQ("s1"));
  const s = () => play.getState();
  answer("s1", true);
  const before = s().score;
  s().chooseStar("star");
  assert.equal(s().score, before + 200);
  assert.equal(s().answers[0].starPoints, 200);
  s().next();
  assert.equal(s().score, before + 200, "nothing more at the end: the pot is empty");
});

test("star points: Go adds nothing until the stars are banked; the later Star banks them all", () => {
  startWith(starQ("s1"), starQ("s2"));
  const s = () => play.getState();
  answer("s1", true);
  const afterFirst = s().score;
  s().chooseStar("go");
  assert.equal(s().score, afterFirst, "carried stars are not points yet");
  s().next();
  answer("s2", true);
  const afterSecond = s().score;
  s().chooseStar("star");
  assert.equal(s().score, afterSecond + (2 + 4) * 100, "2 carried + 4 (x2) banked");
  assert.equal(s().answers[1].starPoints, 600);
  assert.equal(s().answers[0].starPoints, undefined);
});

test("star points: no choice counts as Star and earns its points; leftovers are banked on the last answer", () => {
  startWith(starQ("s1"), starQ("s2"));
  const s = () => play.getState();
  answer("s1", true);
  const before = s().score;
  s().next(); // no choice: Star
  assert.equal(s().score, before + 200);
  answer("s2", true);
  s().chooseStar("go");
  const beforeEnd = s().score;
  s().next(); // last question: the carried 4 stars are banked
  assert.equal(s().phase, "results");
  assert.equal(s().score, beforeEnd + 200, "Star reset the streak, so the second answer was 2 stars");
  assert.equal(s().answers[1].starPoints, 200);
  assert.equal(s().stars.banked, 4);
});

test("star points: a wrong answer loses the carried stars and their points", () => {
  startWith(starQ("s1"), starQ("s2"));
  const s = () => play.getState();
  answer("s1", true);
  s().chooseStar("go");
  const before = s().score;
  s().next();
  answer("s2", false);
  s().next();
  assert.equal(s().stars.banked, 0);
  assert.equal(s().score, before, "no star points, and the wrong answer scores 0");
});

test("star points: scale with the quiz's base points, and the score always equals the sum of the rows", () => {
  const quiz = quizOf(starQ("s1"), starQ("s2"));
  quiz.settings.pointsBase = 500;
  startWith(...quiz.questions);
  play.getState().reset(); play.getState().start(quiz); play.getState().begin(false);
  const s = () => play.getState();
  answer("s1", true); s().chooseStar("star"); s().next();
  answer("s2", true); s().next();
  assert.equal(s().answers[0].starPoints, 100, "2 stars x 50");
  assert.equal(s().answers[1].starPoints, 100);
  assert.equal(s().score, s().answers.reduce((sum, a) => sum + a.points + (a.starPoints ?? 0), 0));
});

test("star points: every other question type scores exactly as before, with or without a star question in the quiz", () => {
  const classic = legacyQuiz();
  // Use the same A/B answers: the first option is correct in each of these classics.
  const plain = quizOf(...classic.questions.slice(0, 3));
  const withStar = quizOf(...classic.questions.slice(0, 3), starQ("s1"));
  const run = (quiz: Quiz) => {
    play.getState().reset(); play.getState().start(quiz); play.getState().begin(false);
    const results: number[] = [];
    for (const question of quiz.questions.filter((x) => x.kind !== "star-collect")) {
      for (const o of question.options.filter((x) => x.correct)) play.getState().toggle(o.id);
      play.getState().submit(500);
      results.push(play.getState().answers.at(-1)!.points);
      play.getState().next();
    }
    return results;
  };
  assert.deepEqual(run(withStar), run(plain), "per-question points of the classic types are identical");
  assert.ok(pointsOf(quizOf(q("pop-match", [0]), q("drag-match", [0], "d"))) > 0);
  const noStar = quizOf(q("pop-match", [0]), q("sequence", [0, 1, 2, 3], "s"));
  play.getState().start(noStar);
  assert.ok(play.getState().answers.every((a) => a.starPoints === undefined));
});
