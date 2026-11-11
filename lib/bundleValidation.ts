/** Structural validation before import writes anything to IndexedDB. */
export function validateBundleData(source: unknown, media: unknown): void {
  const object = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);
  const fail = (): never => { throw new Error("That export contains invalid quiz or media data."); };
  const fields = (value: Record<string, unknown>, names: string[], type: string, nullable = false) => {
    for (const name of names) {
      const item = value[name];
      if (item === undefined || (nullable && item === null)) continue;
      if (typeof item !== type || (type === "number" && !Number.isFinite(item))) fail();
    }
  };
  const ref = (value: unknown) => {
    if (value === undefined) return;
    if (!object(value)) return fail();
    if (value.kind === "url" && typeof value.url === "string") return;
    if (value.kind === "stored" && typeof value.id === "string" &&
      typeof value.w === "number" && typeof value.h === "number") return;
    fail();
  };
  const cues = (value: unknown) => {
    if (value === undefined) return;
    if (!object(value)) return fail();
    for (const cue of Object.values(value)) {
      if (cue === null) continue;
      if (!object(cue)) return fail();
      ref(cue.media); ref(cue.soundMedia);
    }
  };
  if (!object(source) || typeof source.title !== "string" || !Array.isArray(source.questions)) return fail();
  if (!object(source.theme) || !object(source.settings)) return fail();
  fields(source, ["description"], "string");
  fields(source.theme, ["preset", "bgAnimation", "accent", "surface", "font", "bgImageFit", "promptColor", "titleColor", "optionTextColor", "explanationColor", "optionMarker", "correctColor", "wrongColor"], "string");
  fields(source.theme, ["bgImageDim"], "number");
  if (source.theme.optionColors !== undefined &&
    (!Array.isArray(source.theme.optionColors) || source.theme.optionColors.some(color => typeof color !== "string"))) fail();
  fields(source.settings, ["shuffleQuestions", "shuffleOptions", "revealAfterEach", "speedBonus", "streakBonus", "sound", "autoReveal", "autoAdvanceOnTimeout"], "boolean");
  fields(source.settings, ["timerSeconds", "autoAdvanceSeconds"], "number", true);
  fields(source.settings, ["pointsBase", "timeoutRevealSeconds"], "number");
  fields(source.settings, ["progressStyle", "progressPulse", "progressMascot", "quizProgressStyle"], "string");
  ref(source.theme.bgImage); ref(source.settings.progressMascotMedia); cues(source.settings.cues);
  const kinds = ["multiple-choice", "true-false", "multi-select", "image-choice", "image-identification", "reveal"];
  for (const q of source.questions) {
    if (!object(q) || !kinds.includes(String(q.kind)) || typeof q.prompt !== "string" || !Array.isArray(q.options)) return fail();
    fields(q, ["explanation", "layout"], "string");
    fields(q, ["timerSeconds"], "number", true);
    fields(q, ["points", "optionGap"], "number");
    ref(q.media); cues(q.cues);
    if (q.reveal !== undefined) {
      if (!object(q.reveal)) return fail();
      ref(q.reveal.cover);
    }
    for (const option of q.options) {
      if (!object(option) || typeof option.text !== "string" || typeof option.correct !== "boolean") return fail();
      fields(option, ["color", "icon"], "string");
      ref(option.media);
    }
  }
  if (media === undefined) return;
  if (!object(media)) return fail();
  for (const entry of Object.values(media)) {
    if (!object(entry) || typeof entry.dataUrl !== "string" ||
      !/^data:[^,]+;base64,[A-Za-z0-9+/]*={0,2}$/.test(entry.dataUrl)) return fail();
    try { atob(entry.dataUrl.slice(entry.dataUrl.indexOf(",") + 1)); } catch { fail(); }
  }
}
