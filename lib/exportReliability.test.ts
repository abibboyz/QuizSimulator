import { test } from "node:test";
import assert from "node:assert/strict";
import { exportWait } from "./videoExport/wait.ts";
import { DEFAULT_THEME, THEME_PRESETS, themeInk, themeVars, contrastRatio } from "./themes.ts";
import { outputSize } from "./videoExport/codecs.ts";

test("export waits cancel promptly even when the browser operation hangs", async () => {
  const controller = new AbortController();
  const work = exportWait(new Promise(() => {}), controller.signal, "Encoder", 1000);
  controller.abort();
  await assert.rejects(work, { name: "AbortError" });
});
test("hung exports surface a useful timeout error", async () => {
  await assert.rejects(exportWait(new Promise(() => {}), undefined, "Video finalization", 5), /Video finalization timed out/);
});
test("export waits preserve results and original errors", async () => {
  assert.equal(await exportWait(Promise.resolve(42), undefined, "Encoder"), 42);
  await assert.rejects(exportWait(Promise.reject(new Error("Encoder failed")), undefined, "Encoder"), /Encoder failed/);
});
test("theme text stays readable and DOM/export use the same palette", () => {
  for (const preset of THEME_PRESETS) {
    const theme = { ...DEFAULT_THEME, ...preset };
    const ink = themeInk(theme);
    const vars = themeVars(theme) as Record<string, unknown>;
    assert.equal(vars["--prompt-color"], ink[100]);
    assert.equal(vars["--color-ink-900"], ink[900]);
    assert.ok((contrastRatio(ink[100], theme.surface) ?? 0) >= 4.5, preset.label);
  }
  assert.equal(themeInk(DEFAULT_THEME)[100], "#e9ebf4");
  assert.equal(themeVars({ ...DEFAULT_THEME, promptColor: "#123456" })["--prompt-color" as keyof React.CSSProperties], "#123456");
});
test("720p fallback keeps both output aspect ratios", () => {
  assert.deepEqual(outputSize("vertical", "720p"), { width: 720, height: 1280 });
  assert.deepEqual(outputSize("horizontal", "720p"), { width: 1280, height: 720 });
});
