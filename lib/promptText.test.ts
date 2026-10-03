import assert from "node:assert/strict";
import { test } from "node:test";
import { WORD_ART_STYLES, layoutPrompt, promptAlign, promptCharCount, promptFontSize, promptHasEmoji, promptPreservesBreaks, splitEmojiRuns, wordArtCss, wordArtInk, wordArtReadable, wordArtStyleOf } from "./promptText.ts";
import { stageEdge, stageVignette } from "./themeInk.ts";

const width = (sample: string) => [...sample].length;

test("spaces and line breaks each count as one character", () => {
  assert.equal(promptCharCount("a b"), 3);
  assert.equal(promptCharCount("a  b"), 4);
  assert.equal(promptCharCount("a\nb"), 3);
  assert.equal(promptCharCount("a\n\nb"), 4);
  assert.equal(promptCharCount(""), 0);
  assert.equal(promptCharCount("a 😀"), 3);
  assert.equal(promptCharCount("👍🏽"), 1, "a skin-tone emoji is one character");
  assert.equal(promptCharCount("a\n😀"), 3);
  assert.equal(promptHasEmoji("hello"), false);
  assert.equal(promptHasEmoji("hello 😀"), true);
  assert.deepEqual(splitEmojiRuns("a😀b"), [
    { text: "a", emoji: false },
    { text: "😀", emoji: true },
    { text: "b", emoji: false },
  ]);
});

test("only a repeated space, a tab, or Enter asks wrapping to keep the breaks", () => {
  assert.equal(promptPreservesBreaks("What is the capital of France?"), false);
  assert.equal(promptPreservesBreaks("a  b"), true);
  assert.equal(promptPreservesBreaks("a\nb"), true);
  assert.equal(promptPreservesBreaks("a\tb"), true);
});

test("prompt lines keep spaces and treat Enter as its own character", () => {
  assert.deepEqual(layoutPrompt("a b", width, 10), [{ text: "a b", start: 0, end: 3 }]);
  assert.deepEqual(layoutPrompt("ab\ncd", width, 10), [
    { text: "ab", start: 0, end: 3 },
    { text: "cd", start: 3, end: 5 },
  ]);
  assert.deepEqual(layoutPrompt("a\n\nb", width, 10), [
    { text: "a", start: 0, end: 2 },
    { text: "", start: 2, end: 3 },
    { text: "b", start: 3, end: 4 },
  ]);
  const wrapped = layoutPrompt("hello world", width, 8);
  assert.deepEqual(wrapped.map((line) => line.text), ["hello ", "world"]);
  assert.equal(wrapped[0].end, 6, "the space stays on the first line and counts");
  const emoji = layoutPrompt("a😀", width, 1);
  assert.deepEqual(emoji.map((line) => line.text), ["a", "😀"]);
});

test("an unset prompt size and alignment stay on today's values", () => {
  assert.equal(promptFontSize(undefined, 30), 30);
  assert.equal(promptFontSize({ fontSize: 30 }, 20), 20);
  assert.equal(promptFontSize({ fontSize: 60 }, 30), 60);
  assert.equal(promptFontSize({ fontSize: 60 }, 11), 22);
  assert.equal(promptFontSize({ fontSize: 120 }, 30), 120);
  assert.equal(promptFontSize({ fontSize: 144 }, 20), 96);
  assert.equal(promptFontSize({ fontSize: 150 }, 30), 150);
  assert.equal(promptAlign(undefined), "center");
  assert.equal(promptAlign({ align: "left" }), "left");
});

test("word art keeps a contrasting outline, and light stages do not fade to black", () => {
  assert.equal(wordArtInk("#22d3ee", "#070b1a").stroke, "#0a0a0a");
  assert.equal(wordArtInk("#a16207", "#fef9c3").stroke, "#ffffff");
  assert.equal(wordArtStyleOf(true), "classic");
  assert.equal(wordArtStyleOf(undefined), null);
  assert.equal(wordArtInk("#22d3ee", "#070b1a", true).fill, wordArtInk("#22d3ee", "#070b1a", "classic").fill);
  const classicCss = wordArtCss(wordArtInk("#22d3ee", "#070b1a"), 30);
  assert.match(classicCss, /2px 0 0 #0a0a0a/);
  assert.match(classicCss, /4px 4px 0 #ffffff/);
  for (const surface of ["#070b1a", "#fff7d6"]) {
    for (const style of WORD_ART_STYLES) {
      const paint = wordArtInk("#b45309", surface, style.id);
      assert.equal(wordArtReadable(paint, surface), true, `${style.id} on ${surface}`);
    }
  }
  assert.equal(stageEdge("#070b1a"), "#04050a");
  assert.equal(stageVignette("#070b1a"), "rgba(0,0,0,0.55)");
  assert.notEqual(stageEdge("#fef9c3"), "#04050a");
  assert.notEqual(stageVignette("#fef9c3"), "rgba(0,0,0,0.55)");
});
