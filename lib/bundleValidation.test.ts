import assert from "node:assert/strict";
import { test } from "node:test";
import { validateBundleData } from "./bundleValidation.ts";
import { createQuiz } from "./factory.ts";

test("current and legacy bundles retain optional settings", () => {
  const quiz = createQuiz();
  assert.doesNotThrow(() => validateBundleData(quiz, {}));
  assert.doesNotThrow(() => validateBundleData({ ...quiz, settings: {}, theme: {} }, undefined));
});
test("malformed nested questions and media are rejected before import", () => {
  const quiz = createQuiz();
  for (const questions of [[null], [{ kind: "reveal", prompt: "test" }], [{ kind: "reveal", prompt: "test", options: [null] }]]) {
    assert.throws(() => validateBundleData({ ...quiz, questions }, {}));
  }
  for (const media of [[], { a: null }, { a: { dataUrl: "data:image/png;base64,!bad" } }]) {
    assert.throws(() => validateBundleData(quiz, media));
  }
  assert.doesNotThrow(() => validateBundleData(quiz, { a: { dataUrl: "data:image/png;base64,aGVsbG8=" } }));
});
