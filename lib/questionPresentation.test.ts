import assert from "node:assert/strict";
import { test } from "node:test";
import { questionTheme, promptPosition } from "./questionPresentation.ts";
import { DEFAULT_THEME } from "./themes.ts";
import type { Question } from "../types/quiz.ts";

test("local background overrides global only while enabled, including an empty override", () => {
  const theme = { ...DEFAULT_THEME, bgImage: { kind: "url" as const, url: "https://example.com/global.png" } };
  const question = { background: { enabled: false, fit: "contain", dim: 0.2 } } as Question;
  assert.equal(questionTheme(theme, question), theme);
  question.background!.enabled = true;
  assert.equal(questionTheme(theme, question).bgImage, undefined);
  question.background!.image = { kind: "url", url: "https://example.com/local.png" };
  assert.equal(questionTheme(theme, question).bgImage, question.background!.image);
  assert.equal(questionTheme(theme, question).bgImageFit, "contain");
  assert.equal(questionTheme(theme, question).bgImageDim, 0.2);
  assert.equal(questionTheme(theme), theme);
});

test("prompt coordinates stay within the canvas even with malformed imports", () => {
  assert.equal(promptPosition(-20), 0);
  assert.equal(promptPosition(120), 100);
  assert.equal(promptPosition(NaN), 50);
  assert.equal(promptPosition(undefined), 50);
  assert.equal(promptPosition(23), 23);
});
