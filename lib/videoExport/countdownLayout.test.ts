import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuiz } from "../factory.ts";
import { buildTimeline } from "./timeline.ts";
import { syncLiveTimeline } from "./liveTimeline.ts";
import { FrameRenderer, FRAMINGS } from "./renderer.ts";
import { stagePlacementFor, withStagePlacement } from "../stageLayout.ts";

test("countdown placements inherit, override, and reset independently in each view", () => {
  const global = { stageLayout: withStagePlacement(undefined, "web", "countdown", { x: 10, y: 20, width: 30, height: 10 }) };
  const question = { stageLayout: withStagePlacement(undefined, "web", "countdown", { x: 40, y: 60, width: 40, height: 12 }) };
  assert.equal(stagePlacementFor(global, question, "web", "countdown")?.x, 40);
  assert.equal(stagePlacementFor(global, question, "mobile", "countdown"), null);
  question.stageLayout = withStagePlacement(question.stageLayout, "web", "countdown", null);
  assert.equal(stagePlacementFor(global, question, "web", "countdown")?.x, 10);
});

for (const framing of ["horizontal", "vertical"] as const) {
  test(`${framing}: countdown draws in its saved frame rectangle for export and live playback`, () => {
    const quiz = createQuiz("Countdown layout");
    quiz.questions = [{ id: "q", kind: "multiple-choice", layout: "grid", prompt: "Test", options: [{ id: "a", text: "A", correct: true }] }];
    const view = framing === "vertical" ? "mobile" : "web";
    quiz.questions[0].stageLayout = withStagePlacement(undefined, view, "countdown", { x: 20, y: 30, width: 40, height: 10 });
    const timeline = buildTimeline(quiz, { answerMode: "timeout", sound: false });
    const noop = () => {};
    const ctx = { save: noop, restore: noop, setTransform: noop, translate: noop, scale: noop };
    const frame = FRAMINGS[framing];
    const canvas = { width: frame.cssWidth, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const renderer = new FrameRenderer(canvas, timeline, quiz, framing, { images: new Map(), fonts: { sans: "sans-serif", mono: "monospace", display: "sans-serif" } });
    const messages: string[] = [];
    const drawing = renderer as unknown as { drawTimeoutBar: (run: typeof timeline.questions[number], t: number, x: number, y: number, w: number) => void; drawLine: (message: string) => void; fillRR: () => void };
    drawing.drawLine = (message) => { messages.push(message); };
    drawing.fillRR = noop;
    const run = timeline.questions[0];
    drawing.drawTimeoutBar(run, 0, 20, 500, 320);
    const expected = { x: frame.cssWidth * .2, y: frame.cssHeight * .3, w: frame.cssWidth * .4, h: frame.cssHeight * .1 };
    assert.deepEqual(renderer.stageItemFrameRects().countdown, expected);
    assert.ok(messages[0].includes(`${run.holdSeconds}s`), "preview before reveal shows the full hold duration");
    syncLiveTimeline(timeline, { index: 0, elapsedMs: 4000, remainingMs: 0, limitSeconds: 20, revealAt: 0, picks: [], correct: false, outcomes: [], countdown: { at: 3000, seconds: 7 } });
    assert.equal(run.timeoutBar, true);
    drawing.drawTimeoutBar(run, 4000, 20, 500, 320);
    assert.deepEqual(renderer.stageItemFrameRects().countdown, expected);
    assert.ok(messages.at(-1)?.includes("6s"), "live wait uses its actual start and duration");
    syncLiveTimeline(timeline, { index: 0, elapsedMs: 5000, remainingMs: 0, limitSeconds: 20, revealAt: 0, picks: [], correct: false, outcomes: [] });
    assert.equal(run.timeoutBar, false, "position does not force visibility during live playback");
  });
}
