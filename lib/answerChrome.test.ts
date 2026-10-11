import { test } from "node:test";
import assert from "node:assert/strict";
import { answerChrome, boxlessFrame, boxlessState, boxlessTextColor, feedbackBarColor, lighten, tintLettering } from "./answerChrome.ts";
import { schemaVersionFor, type Quiz } from "../types/quiz.ts";

test("old quizzes (no flags) keep markers and boxes", () => {
  assert.deepEqual(answerChrome(undefined), { hideMarkers: false, hideBoxes: false });
  assert.deepEqual(answerChrome({}), { hideMarkers: false, hideBoxes: false });
  assert.deepEqual(answerChrome({ hideAnswerMarkers: true, hideAnswerBoxes: true }), { hideMarkers: true, hideBoxes: true });
});

test("box-less feedback states", () => {
  assert.equal(boxlessState({ revealed: false, correct: true, picked: false }), "rest");
  assert.equal(boxlessState({ revealed: false, correct: false, picked: true }), "picked");
  assert.equal(boxlessState({ revealed: true, correct: true, picked: false }), "correct");
  assert.equal(boxlessState({ revealed: true, correct: false, picked: true }), "wrong");
  assert.equal(boxlessState({ revealed: true, correct: false, picked: true, unscored: true }), "rest");
  assert.equal(boxlessState({ revealed: true, correct: false, picked: false }), "rest");
});

test("box-less bar and text colours follow the reveal colours", () => {
  const c = { correct: "#22c55e", wrong: "#ef4444" };
  assert.equal(feedbackBarColor("correct", c), c.correct);
  assert.equal(feedbackBarColor("wrong", c), c.wrong);
  assert.equal(feedbackBarColor("picked", c), "rgba(255,255,255,0.7)");
  assert.equal(feedbackBarColor("rest", c), null);
  const t = { rest: "#ffffff", ...c };
  assert.equal(boxlessTextColor("rest", t), "#ffffff");
  assert.equal(boxlessTextColor("picked", t), "#ffffff");
  assert.equal(boxlessTextColor("correct", t), c.correct);
  assert.equal(boxlessTextColor("wrong", t), c.wrong);
});

test("schema: the new switches only bump files that use them", () => {
  const base = { settings: {} as Quiz["settings"], questions: [] as Quiz["questions"] };
  assert.equal(schemaVersionFor({ ...base, theme: {} as Quiz["theme"] }), 1);
  assert.equal(schemaVersionFor({ ...base, theme: { hideAnswerMarkers: true } as Quiz["theme"] }), 7);
  assert.equal(schemaVersionFor({ ...base, theme: { hideAnswerBoxes: true } as Quiz["theme"] }), 7);
});

test("per-answer colour becomes the lettering accent; unset leaves the preset alone", () => {
  const style = { palette: [["#ffc2e2", "#ff2e93"]] as [string, string][], outline: "#1b1020" };
  assert.equal(tintLettering(style, undefined), style);
  assert.equal(tintLettering(style, "red"), style);
  assert.deepEqual(tintLettering(style, "#3366FF"), { palette: [[lighten("#3366ff", 0.6), "#3366ff"]], outline: "#1b1020" });
  assert.equal(lighten("#000000", 0.5), "#808080");
  assert.equal(lighten("#ffffff", 0.3), "#ffffff");
});

test("schema: per-answer colours (an existing field) never bump the version", () => {
  const q = (opt: object) => ({ id: "q", kind: "image-choice", prompt: "", layout: "grid", options: [{ id: "o", text: "", correct: true, ...opt }, { id: "p", text: "", correct: false }] }) as unknown as Quiz["questions"][number];
  const theme = {} as Quiz["theme"];
  const settings = {} as Quiz["settings"];
  assert.ok(schemaVersionFor({ theme, settings, questions: [q({ color: "#ff0000" })] }) < 7);
});

test("boxlessFrame eases bar and text like the DOM transition", () => {
  const mix = (a: string, b: string, t: number) => (a === b || t >= 1 ? b : t <= 0 ? a : `${a}->${b}@${t}`);
  const colors = { rest: "#fff", correct: "#0f0", wrong: "#f00" };
  assert.deepEqual(boxlessFrame({ revealed: false, rp: 0, pickP: 0, correct: true, picked: false }, colors, mix), { text: "#fff", bar: null });
  assert.deepEqual(boxlessFrame({ revealed: false, rp: 0, pickP: 0.5, correct: false, picked: true }, colors, mix).bar, { color: "rgba(255,255,255,0.7)", alpha: 0.5, glow: false });
  assert.deepEqual(boxlessFrame({ revealed: true, rp: 1, pickP: 1, correct: true, picked: false }, colors, mix), { text: "#0f0", bar: { color: "#0f0", alpha: 1, glow: true } });
  assert.deepEqual(boxlessFrame({ revealed: true, rp: 1, pickP: 1, correct: false, picked: true }, colors, mix), { text: "#f00", bar: { color: "#f00", alpha: 1, glow: false } });
  assert.deepEqual(boxlessFrame({ revealed: true, rp: 0.5, pickP: 1, correct: false, picked: false }, colors, mix), { text: "#fff", bar: null });
});
