import assert from "node:assert/strict";
import { test } from "node:test";
import { createQuiz } from "../factory.ts";
import { buildTimeline } from "./timeline.ts";
import { FrameRenderer, FRAMINGS, type Framing } from "./renderer.ts";
import type { MediaRef } from "../../types/quiz.ts";

// Inspect layout geometry without a browser; drawing itself remains canvas-based.
type LayoutRenderer = {
  imageGridBox: (run: ReturnType<typeof buildTimeline>["questions"][number], t: number, width: number, height?: number) => { w: number; h: number };
  answerGridBox: LayoutRenderer["imageGridBox"];
  mediaBox: (ref: MediaRef, width: number, height: number, radius: number, expand: boolean) => { w: number; h: number; draw: (x: number, y: number) => void };
};

for (const framing of ["horizontal", "vertical"] satisfies Framing[]) {
  test(`${framing}: one image or answer fills the resized region and can shrink again`, () => {
    const quiz = createQuiz("Adaptive images");
    quiz.questions = [{ id: "q", kind: "image-choice", layout: "grid", prompt: "Picture", options: [{ id: "a", text: "", correct: true }] }];
    const timeline = buildTimeline(quiz, { answerMode: "pick-correct", sound: false });
    const draws: unknown[][] = [];
    const noop = () => {};
    const ctx = {
      filter: "none", measureText: (text: string) => ({ width: text.length * 8 }),
      save: noop, restore: noop, beginPath: noop, moveTo: noop, arcTo: noop, closePath: noop, clip: noop,
      drawImage: (...args: unknown[]) => draws.push(args),
    };
    const canvas = { width: FRAMINGS[framing].cssWidth, getContext: () => ctx } as unknown as HTMLCanvasElement;
    const source = {} as CanvasImageSource;
    const renderer = new FrameRenderer(canvas, timeline, quiz, framing, { images: new Map([["s:small", { source, width: 40, height: 20 }]]), fonts: { sans: "sans-serif", mono: "monospace", display: "sans-serif" } }) as unknown as LayoutRenderer;
    const run = timeline.questions[0];
    const width = framing === "vertical" ? 360 : 800;
    for (const height of [200, 600, 150]) {
      const grid = renderer.imageGridBox(run, 0, width, height);
      assert.equal(grid.w, width);
      assert.equal(grid.h, height);
      assert.equal(renderer.answerGridBox(run, 0, width, height).h, height);
      const media = renderer.mediaBox({ kind: "stored", id: "small", w: 40, h: 20 }, width, height, 0, true);
      assert.equal(media.w, width);
      assert.equal(media.h, height);
      media.draw(0, 0);
      const scale = Math.min(width / 40, height / 20);
      assert.deepEqual(draws.at(-1), [source, (width - 40 * scale) / 2, (height - 20 * scale) / 2, 40 * scale, 20 * scale], "draw the entire source, centered and proportional, without a crop rectangle");
    }
    run.question.options = Array.from({ length: 4 }, (_, i) => ({ id: String(i), text: "Caption", correct: i === 0 }));
    assert.equal(renderer.imageGridBox(run, 0, width, 600).h, 600);
    const original = renderer.mediaBox({ kind: "stored", id: "small", w: 40, h: 20 }, width, 600, 0, false);
    assert.equal(original.w, 40, "untouched layouts preserve their original image size");
  });
}
