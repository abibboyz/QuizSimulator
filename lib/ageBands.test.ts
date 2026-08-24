import assert from "node:assert/strict";
import { test } from "node:test";
import {
  AGE_BANDS,
  OPTION_STYLES,
  applyAgeBand,
  getAgeBand,
  isAgeBand,
  OPTION_MARKERS,
  optionColor,
  optionMarker,
  optionStyle,
  themeAgeBand,
} from "./ageBands.ts";
import {
  DEFAULT_CORRECT_COLOR,
  DEFAULT_WRONG_COLOR,
  contrastRatio,
  readableTextOn,
} from "./color.ts";
import type { Theme } from "../types/quiz.ts";

/** Mirrors BASE_THEME without importing the theme module, which pulls in JSX-free but alias-heavy code. */
const BASE_THEME: Theme = {
  preset: "neon",
  bgAnimation: "particles",
  accent: "#22d3ee",
  surface: "#070b1a",
  font: "display",
  bgImageFit: "cover",
  bgImageDim: 0.45,
};

function hueOf(hex: string): number {
  const int = parseInt(hex.replace("#", ""), 16);
  const r = ((int >> 16) & 255) / 255;
  const g = ((int >> 8) & 255) / 255;
  const b = (int & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta === 0) return 0;
  const h = max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  return ((h * 60) % 360 + 360) % 360;
}

const allPalettes = [
  { name: "default", palette: OPTION_STYLES },
  ...AGE_BANDS.map((band) => ({ name: band.id, palette: band.optionPalette })),
];

test("no answer tile sits in the red or green hue range", () => {
  for (const { name, palette } of allPalettes) {
    for (const style of palette) {
      const hue = hueOf(style.bg);
      const isRed = hue >= 340 || hue <= 20;
      const isGreen = hue >= 80 && hue <= 160;
      assert.equal(isRed, false, `${name}/${style.name} ${style.bg} is red (hue ${hue.toFixed(0)}°)`);
      assert.equal(isGreen, false, `${name}/${style.name} ${style.bg} is green (hue ${hue.toFixed(0)}°)`);
    }
  }
});

test("tiles within a palette are tellable apart from each other", () => {
  // Two tiles can share a hue neighbourhood as long as they differ clearly in
  // lightness — that's the deal the amber/orange pair makes. What's not allowed
  // is being close on both axes at once.
  const MIN_HUE_GAP = 25;
  const MIN_LIGHTNESS_STEP = 1.5;

  for (const { name, palette } of allPalettes) {
    for (let i = 0; i < palette.length; i++) {
      for (let j = i + 1; j < palette.length; j++) {
        const a = palette[i];
        const b = palette[j];
        const raw = Math.abs(hueOf(a.bg) - hueOf(b.bg));
        const hueGap = Math.min(raw, 360 - raw);
        const step = contrastRatio(a.bg, b.bg) ?? 1;

        assert.ok(
          hueGap >= MIN_HUE_GAP || step >= MIN_LIGHTNESS_STEP,
          `${name}: ${a.name} ${a.bg} and ${b.name} ${b.bg} are only ${hueGap.toFixed(0)}° apart ` +
            `with a ${step.toFixed(2)} lightness step`,
        );
      }
    }
  }
});

test("shapes and their order are identical across every band", () => {
  const reference = OPTION_STYLES.map((style) => style.shape);
  for (const band of AGE_BANDS) {
    assert.deepEqual(
      band.optionPalette.map((style) => style.shape),
      reference,
      `${band.id} must reuse the shared shape order — it is the colour-blind fallback`,
    );
  }
});

test("every tile label is readable on its own tile", () => {
  for (const { name, palette } of allPalettes) {
    for (const style of palette) {
      const ratio = contrastRatio(readableTextOn(style.bg), style.bg);
      assert.ok(ratio !== null && ratio >= 4.5, `${name}/${style.name} ${style.bg} label contrast ${ratio?.toFixed(2)}`);
    }
  }
});

test("every band has six tiles and optionStyle wraps past the end", () => {
  for (const band of AGE_BANDS) {
    assert.equal(band.optionPalette.length, 6, `${band.id} should define six tiles`);
    assert.deepEqual(optionStyle(0, band.id), optionStyle(6, band.id), "index should wrap");
    assert.deepEqual(optionStyle(1, band.id), band.optionPalette[1]);
  }
});

test("optionStyle falls back to the default palette without a band", () => {
  assert.deepEqual(optionStyle(0), OPTION_STYLES[0]);
  assert.deepEqual(optionStyle(2), OPTION_STYLES[2]);
});

test("applyAgeBand re-skins the whole stage", () => {
  const before = { ...BASE_THEME, bgAnimation: "none" as const, font: "mono" as const, bgImageDim: 0.7 };
  const after = applyAgeBand(before, "9-12");
  const band = getAgeBand("9-12");

  assert.equal(after.preset, "9-12");
  assert.equal(after.accent, band.accent);
  assert.equal(after.surface, band.surface);
  assert.equal(after.bgAnimation, band.bgAnimation, "the background should move with the audience");
  assert.equal(after.promptColor, band.promptColor);
  assert.equal(after.titleColor, band.titleColor);
  assert.equal(after.explanationColor, band.explanationColor);

  // Things that aren't part of the look must survive untouched.
  assert.equal(after.font, "mono");
  assert.equal(after.bgImageDim, 0.7);
  assert.equal(after.bgImageFit, before.bgImageFit);

  // And it must return a theme — no settings or questions rode along.
  assert.equal("settings" in after, false);
  assert.equal("questions" in after, false);
});

test("applyAgeBand keeps a background image the author supplied", () => {
  const bgImage = { kind: "url", url: "https://example.test/bg.gif" } as const;
  const after = applyAgeBand({ ...BASE_THEME, bgImage }, "6-8");
  assert.deepEqual(after.bgImage, bgImage);
});

test("every band names a real background animation", () => {
  const valid = new Set(["aurora", "particles", "shapes", "starfield", "none"]);
  for (const band of AGE_BANDS) {
    assert.ok(valid.has(band.bgAnimation), `${band.id} has an unknown background ${band.bgAnimation}`);
  }
});

test("applyAgeBand clears a stale answer-text override", () => {
  // Left unset, each tile picks its own readable label colour — which is what a
  // freshly re-coloured palette needs.
  const after = applyAgeBand({ ...BASE_THEME, optionTextColor: "#123456" }, "3-5");
  assert.equal(after.optionTextColor, undefined);
});

test("the band is derived from the preset, so the two cannot disagree", () => {
  assert.equal(themeAgeBand(BASE_THEME), undefined);
  assert.equal(themeAgeBand(applyAgeBand(BASE_THEME, "13-16")), "13-16");

  // Choosing an ordinary palette preset drops the band by definition.
  const backToNeon = { ...applyAgeBand(BASE_THEME, "13-16"), preset: "neon" as const };
  assert.equal(themeAgeBand(backToNeon), undefined);
});

test("optionMarker renders each built-in style", () => {
  assert.equal(optionMarker(0), "▲", "shapes are the default");
  assert.equal(optionMarker(3, { marker: "shapes" }), "■");
  assert.equal(optionMarker(0, { marker: "letters" }), "A");
  assert.equal(optionMarker(3, { marker: "letters" }), "D");
  assert.equal(optionMarker(0, { marker: "numbers" }), "1");
  assert.equal(optionMarker(3, { marker: "numbers" }), "4");
  assert.equal(optionMarker(2, { marker: "bullets" }), "●");
  assert.equal(optionMarker(2, { marker: "none" }), "", "none renders no badge at all");
});

test("a per-option icon beats the quiz-wide marker, blank falls through", () => {
  assert.equal(optionMarker(0, { marker: "numbers", override: "🍕" }), "🍕");
  assert.equal(optionMarker(0, { marker: "none", override: "🍕" }), "🍕", "an explicit icon shows even when markers are off");
  assert.equal(optionMarker(1, { marker: "numbers", override: "   " }), "2", "whitespace is not an icon");
  assert.equal(optionMarker(1, { marker: "numbers", override: "" }), "2");
});

test("markers follow the band's shapes and wrap with the palette", () => {
  assert.equal(optionMarker(0, { band: "13-16" }), "▲");
  assert.equal(optionMarker(6, { band: "13-16" }), "▲", "shape order wraps with the tiles");
  assert.equal(optionMarker(26, { marker: "letters" }), "A", "letters wrap rather than running past Z");
});

test("every marker style is listed in the builder", () => {
  assert.deepEqual(
    OPTION_MARKERS.map((option) => option.id),
    ["shapes", "letters", "numbers", "bullets", "none"],
  );
});

test("optionColor layers per-answer over quiz-wide over palette", () => {
  const band = getAgeBand("13-16");

  // Nothing set: the palette wins.
  assert.equal(optionColor(0, { band: "13-16" }), band.optionPalette[0].bg);

  // A quiz-wide slot overrides just that slot.
  const colors = ["#111111", "", "", "", "", ""];
  assert.equal(optionColor(0, { band: "13-16", colors }), "#111111");
  assert.equal(optionColor(1, { band: "13-16", colors }), band.optionPalette[1].bg, "blank slots fall through");

  // A per-answer colour beats both.
  assert.equal(optionColor(0, { band: "13-16", colors, override: "#222222" }), "#222222");
  assert.equal(optionColor(3, { band: "13-16", override: "#333333" }), "#333333");
});

test("optionColor ignores whitespace and wraps with the palette", () => {
  assert.equal(optionColor(0, { override: "   " }), OPTION_STYLES[0].bg, "whitespace is not a colour");
  assert.equal(optionColor(0, { colors: ["  "] }), OPTION_STYLES[0].bg);
  assert.equal(optionColor(6), OPTION_STYLES[0].bg, "slot index wraps like the palette");
  assert.equal(optionColor(6, { colors: ["#abcdef", "", "", "", "", ""] }), "#abcdef");
});

test("applyAgeBand paints every tile the band's single colour", () => {
  const band = getAgeBand("6-8");
  const after = applyAgeBand({ ...BASE_THEME, optionColors: ["#111111", "#222222"] }, "6-8");

  assert.equal(after.optionColors?.length, band.optionPalette.length);
  assert.deepEqual(
    new Set(after.optionColors),
    new Set([band.tileColor]),
    "every slot should be the same colour, replacing any earlier overrides",
  );

  // And that colour is what actually resolves for each answer.
  for (let i = 0; i < band.optionPalette.length; i++) {
    assert.equal(optionColor(i, { band: "6-8", colors: after.optionColors }), band.tileColor);
  }
});

test("a per-answer colour still wins over the band's flat colour", () => {
  const after = applyAgeBand(BASE_THEME, "9-12");
  assert.equal(optionColor(2, { band: "9-12", colors: after.optionColors, override: "#abcdef" }), "#abcdef");
});

test("no band's default tile colour is red or green", () => {
  for (const band of AGE_BANDS) {
    const hue = hueOf(band.tileColor);
    assert.equal(hue >= 340 || hue <= 20, false, `${band.id} tile colour ${band.tileColor} is red`);
    assert.equal(hue >= 80 && hue <= 160, false, `${band.id} tile colour ${band.tileColor} is green`);

    const ratio = contrastRatio(readableTextOn(band.tileColor), band.tileColor);
    assert.ok(ratio !== null && ratio >= 4.5, `${band.id} tile colour ${band.tileColor} label contrast ${ratio}`);
  }
});

test("the reveal defaults are green and red, and readable", () => {
  assert.equal(Math.round(hueOf(DEFAULT_CORRECT_COLOR)), 142, "correct should be green");
  assert.equal(Math.round(hueOf(DEFAULT_WRONG_COLOR)), 0, "wrong should be red");

  for (const color of [DEFAULT_CORRECT_COLOR, DEFAULT_WRONG_COLOR]) {
    const ratio = contrastRatio(readableTextOn(color), color);
    assert.ok(ratio !== null && ratio >= 4.5, `${color} label contrast ${ratio?.toFixed(2)}`);
  }
});

test("no band default collides with the reveal colours", () => {
  // Authors may set red or green deliberately; the shipped defaults must not,
  // or a resting tile reads as already answered.
  const revealHues = [hueOf(DEFAULT_CORRECT_COLOR), hueOf(DEFAULT_WRONG_COLOR)];

  for (const band of AGE_BANDS) {
    for (const hue of revealHues) {
      const raw = Math.abs(hueOf(band.tileColor) - hue);
      const gap = Math.min(raw, 360 - raw);
      assert.ok(gap >= 40, `${band.id} tile ${band.tileColor} is only ${gap.toFixed(0)}° from a reveal colour`);
    }
  }
});

test("isAgeBand only recognises real bands", () => {
  assert.equal(isAgeBand("3-5"), true);
  assert.equal(isAgeBand("neon"), false);
  assert.equal(isAgeBand("17-99"), false);
});
