import { test } from "node:test";
import assert from "node:assert/strict";
import { themeInk } from "./themeInk.ts";
import { themeInk as compatibilityExport, DEFAULT_THEME, themeVars } from "./themes.ts";

test("the builder palette has a direct callable export and preserves the theme API", () => {
  assert.equal(typeof themeInk, "function");
  assert.equal(compatibilityExport, themeInk);
  assert.equal(themeInk(DEFAULT_THEME)[100], "#e9ebf4");
  assert.equal(themeInk({ ...DEFAULT_THEME, surface: "#ffffff" })[100], "#0f172a");
  assert.equal(themeVars(DEFAULT_THEME)["--prompt-color" as keyof React.CSSProperties], themeInk(DEFAULT_THEME)[100]);
});
