import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CANDY_PALETTE,
  DEFAULT_OUTLINE,
  DEPTH_EM,
  OUTLINE_EM,
  RIM_EM,
  TEXT_STYLE_PRESETS,
  fitStyledSize,
  lineBaseline,
  normalizeTextStyle,
  resolveTextStyle,
  styledWrapWidth,
  textStylePadding,
  usesTextStyle,
  withTextStyles,
  wrapWords,
} from "./textStyle.ts";
import type { TextStyleSetting } from "../types/quiz.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} ≈ ${b}`);

test("missing, unknown or malformed styles normalize to Plain", () => {
  for (const value of [undefined, null, 3, "pink", {}, { preset: "neon" }, { preset: 7 }]) {
    assert.deepEqual(normalizeTextStyle(value), { preset: "plain" });
  }
  assert.equal(resolveTextStyle(undefined), null);
  assert.equal(resolveTextStyle({ preset: "plain" }), null);
});

test("Plain drops stray fields; presets keep only the image", () => {
  assert.deepEqual(normalizeTextStyle({ preset: "plain", top: "#ffffff", image: { kind: "stored", id: "m1" } }), { preset: "plain" });
  assert.deepEqual(normalizeTextStyle({ preset: "sky-blue", top: "#000000", depth: 2 }), { preset: "sky-blue" });
  assert.deepEqual(normalizeTextStyle({ preset: "candy", image: { kind: "stored", id: "m1" } }), {
    preset: "candy",
    image: { kind: "stored", id: "m1" },
  });
  assert.deepEqual(normalizeTextStyle({ preset: "candy", image: { kind: "stored" } }), { preset: "candy" });
});

test("Custom fills defaults, validates colours and clamps depth", () => {
  assert.deepEqual(normalizeTextStyle({ preset: "custom" }), {
    preset: "custom",
    top: "#fff7a8",
    bottom: "#ff6a00",
    outline: DEFAULT_OUTLINE,
    depth: 1,
    rim: true,
  });
  assert.deepEqual(normalizeTextStyle({ preset: "custom", top: "#ABCDEF", bottom: "red", outline: " #00FF00 ", depth: 9, rim: false }), {
    preset: "custom",
    top: "#abcdef",
    bottom: "#ff6a00",
    outline: "#00ff00",
    depth: 2,
    rim: false,
  });
  assert.equal(normalizeTextStyle({ preset: "custom", depth: -3 }).depth, 0);
  assert.equal(normalizeTextStyle({ preset: "custom", depth: Number.NaN }).depth, 1);
});

test("every non-plain preset resolves with the shared outline, depth and rim", () => {
  for (const preset of TEXT_STYLE_PRESETS.filter((p) => p.id !== "plain" && p.id !== "custom")) {
    const resolved = resolveTextStyle({ preset: preset.id });
    assert.ok(resolved, preset.id);
    assert.equal(resolved.outline, DEFAULT_OUTLINE);
    assert.equal(resolved.depth, 1);
    assert.equal(resolved.rim, true);
    if (preset.id === "candy") assert.deepEqual(resolved.palette, CANDY_PALETTE);
    else assert.deepEqual(resolved.palette, [[preset.top, preset.bottom]]);
  }
  const custom = resolveTextStyle({ preset: "custom", top: "#111111", bottom: "#222222", outline: "#333333", depth: 0.5, rim: false });
  assert.deepEqual(custom, { preset: "custom", palette: [["#111111", "#222222"]], outline: "#333333", depth: 0.5, rim: false });
});

test("withTextStyles adds nothing to old themes and cleans present ones", () => {
  const old: { font: string; accent: string; promptTextStyle?: TextStyleSetting } = { font: "display", accent: "#fff" };
  assert.deepEqual(withTextStyles(old), old);
  assert.equal("promptTextStyle" in withTextStyles(old), false);
  const cleaned = withTextStyles({ promptTextStyle: { preset: "bogus" as never }, answerTextStyle: { preset: "custom", depth: 5 } });
  assert.deepEqual(cleaned.promptTextStyle, { preset: "plain" });
  assert.equal(cleaned.answerTextStyle?.depth, 2);
  assert.equal(usesTextStyle(old), false);
  assert.equal(usesTextStyle({ promptTextStyle: { preset: "plain" } }), false);
  assert.equal(usesTextStyle({ answerTextStyle: { preset: "candy" } }), true);
});

test("padding: outline + rim on every side, depth added right and bottom", () => {
  const pad = textStylePadding(100, { depth: 1, rim: true });
  close(pad.top, 100 * (OUTLINE_EM + RIM_EM));
  close(pad.left, pad.top);
  close(pad.right, pad.top + 100 * DEPTH_EM);
  close(pad.bottom, pad.right);
  const flat = textStylePadding(40, { depth: 0, rim: false });
  close(flat.top, 40 * OUTLINE_EM);
  close(flat.right, flat.left);
  close(textStylePadding(40, { depth: 5, rim: false }).right, 40 * OUTLINE_EM + 40 * DEPTH_EM * 2);
  assert.deepEqual(textStylePadding(Number.NaN, { depth: 1, rim: true }), { top: 0, left: 0, right: 0, bottom: 0 });
});

test("wrap width subtracts left + right padding and never drops below 1", () => {
  const style = { depth: 1, rim: true };
  const pad = textStylePadding(20, style);
  close(styledWrapWidth(300, 20, style), 300 - pad.left - pad.right);
  assert.equal(styledWrapWidth(2, 20, style), 1);
});

test("fitStyledSize shrinks until text + padding fits, with a floor", () => {
  const style = { depth: 1, rim: true };
  const textWidth = (size: number) => size * 10; // 10 em wide
  const fitted = fitStyledSize(40, 300, textWidth, style);
  assert.ok(textWidth(fitted) <= styledWrapWidth(300, fitted, style));
  assert.ok(textWidth(fitted + 0.5) > styledWrapWidth(300, fitted + 0.5, style));
  assert.equal(fitStyledSize(20, 1000, textWidth, style), 20);
  assert.equal(fitStyledSize(40, 10, textWidth, style, 12), 12);
});

test("wrapWords matches greedy break-words wrapping", () => {
  const measure = (s: string) => s.length * 10;
  assert.deepEqual(wrapWords("one two three four", measure, 90), ["one two", "three", "four"]);
  assert.deepEqual(wrapWords("  spaced   out  ", measure, 1000), ["spaced out"]);
  assert.deepEqual(wrapWords("", measure, 100), [""]);
  assert.deepEqual(wrapWords("abcdefghij xy", measure, 40), ["abcd", "efgh", "ij", "xy"]);
});

test("styled padding narrows the wrap so long answers break earlier", () => {
  const measure = (s: string) => s.length * 10;
  const style = { depth: 2, rim: true };
  const plain = wrapWords("aaaa bbbb cccc", measure, 95);
  const styled = wrapWords("aaaa bbbb cccc", measure, styledWrapWidth(95, 40, style));
  assert.deepEqual(plain, ["aaaa bbbb", "cccc"]);
  assert.deepEqual(styled, ["aaaa", "bbbb", "cccc"]);
});

test("lineBaseline centres the glyph box in the CSS line box", () => {
  close(lineBaseline(0, 30, 16, 4), 5 + 16);
  close(lineBaseline(100, 20, 20, 0), 120);
});
