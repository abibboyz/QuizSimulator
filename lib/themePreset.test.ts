import assert from "node:assert/strict";
import test from "node:test";
import { applyThemePreset, DEFAULT_THEME, getPreset, THEME_PRESETS } from "./themes.ts";

test("theme presets are alphabetic and include vibrant light and dark choices", () => {
  assert.deepEqual(
    THEME_PRESETS.map((preset) => preset.label),
    THEME_PRESETS.map((preset) => preset.label).toSorted((a, b) => a.localeCompare(b)),
  );
  assert.ok(THEME_PRESETS.length >= 20);
  assert.ok(THEME_PRESETS.some((preset) => preset.surface === "#07071a"));
  assert.ok(THEME_PRESETS.some((preset) => preset.surface === "#fef9c3"));
});

test("choosing a theme changes only its palette", () => {
  const before = {
    ...DEFAULT_THEME,
    font: "comic" as const,
    bgAnimation: "starfield" as const,
    bgImage: { kind: "url" as const, url: "https://example.com/background.png" },
    promptColor: "#123456",
    titleColor: "#234567",
    optionColors: ["#345678"],
    explanationColor: "#456789",
  };
  const after = applyThemePreset(before, "lemonade");
  const preset = getPreset("lemonade");

  assert.deepEqual(after, { ...before, preset: "lemonade", accent: preset.accent, surface: preset.surface });
});
