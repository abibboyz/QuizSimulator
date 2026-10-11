"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Quiz } from "@/types/quiz";
import { canvasBackingSize } from "@/lib/canvasSize";
import { imageRefs, mediaKey } from "@/lib/mediaRefs";
import { loopTime, previewSegment } from "@/lib/previewFrame";
import { loadAssets, releaseAssets } from "@/lib/videoExport/assets";
import { FRAMINGS, FrameRenderer, type Framing, type RenderAssets } from "@/lib/videoExport/renderer";
import { buildTimeline } from "@/lib/videoExport/timeline";

interface Props {
  quiz: Quiz;
  /** Authored index of the question being edited. */
  index: number;
  framing: Framing;
}

function clock(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;
}

/**
 * The builder preview in Web (16:9) or Mobile (9:16) framing.
 *
 * Draws the video export's FrameRenderer live, on the same timeline the export
 * builds ("let the clock run out" answers), at the export's own viewport. So
 * this is not a look-alike of play and export: it is the export's renderer,
 * which is the one built to match play — progress header, timer, Reveal,
 * image answers, animations, celebration and results all come from one place.
 *
 * It loops the question being edited, from its stage mounting to the next one
 * mounting (entrance, clock, reveal, hold, exit), or the results screen.
 */
export function FramedPreview({ quiz, index, framing }: Props) {
  const frame = FRAMINGS[framing];
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);

  const [cssWidth, setCssWidth] = useState(0);
  const [assets, setAssets] = useState<RenderAssets | null>(null);
  const [failed, setFailed] = useState(false);
  const [playing, setPlaying] = useState(true);
  // Results are shown "for" a question index, so picking another question goes back to it.
  const [resultsFor, setResultsFor] = useState<number | null>(null);
  const showResults = resultsFor === index;

  const timeline = useMemo(() => buildTimeline(quiz, { answerMode: "timeout", sound: false }), [quiz]);
  const segment = useMemo(
    () => previewSegment(timeline, showResults ? { kind: "results" } : { kind: "question", index }),
    [timeline, showResults, index],
  );

  // Pictures and fonts, loaded exactly as the export loads them. Reloaded only
  // when the set of pictures changes, not on every keystroke.
  const refsKey = useMemo(() => imageRefs(quiz).map(mediaKey).join("|"), [quiz]);
  const quizRef = useRef(quiz);
  useEffect(() => {
    quizRef.current = quiz;
  });
  const assetsRef = useRef<RenderAssets | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    loadAssets(quizRef.current, undefined, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) {
          releaseAssets(result.assets);
          return;
        }
        // Swap first, free the old bitmaps once the next frame has drawn with the new ones.
        const previous = assetsRef.current;
        assetsRef.current = result.assets;
        setFailed(false);
        setAssets(result.assets);
        if (previous) setTimeout(() => releaseAssets(previous), 500);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error(error);
        setFailed(true);
      });
    return () => controller.abort();
  }, [refsKey]);
  useEffect(
    () => () => {
      if (assetsRef.current) releaseAssets(assetsRef.current);
      assetsRef.current = null;
    },
    [],
  );

  // The CSS box comes from layout alone (width + aspect-ratio); the canvas is
  // out of flow and its backing store follows the box one way (lib/canvasSize).
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const observer = new ResizeObserver(([entry]) => setCssWidth(entry.contentRect.width));
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Playback clock: survives edits (typing doesn't restart the loop) but
  // restarts when the target changes.
  const elapsedRef = useRef(0);
  const targetKey = showResults ? "results" : `q${index}`;
  useEffect(() => {
    elapsedRef.current = 0;
  }, [targetKey]);

  const ready = !!assets && cssWidth > 0;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !assets || cssWidth <= 0) return;
    const { width } = canvasBackingSize(cssWidth, (cssWidth * frame.cssHeight) / frame.cssWidth, window.devicePixelRatio);
    // Height follows width exactly, so the renderer's single scale fits both axes.
    const height = Math.max(1, Math.round((width * frame.cssHeight) / frame.cssWidth));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    let renderer: FrameRenderer;
    try {
      renderer = new FrameRenderer(canvas, timeline, quiz, framing, assets);
    } catch (error) {
      console.error(error);
      return;
    }

    let id = 0;
    let last = performance.now();
    let warned = false;
    let drawn = Number.NaN;
    const span = segment.end - segment.start;
    const tick = (now: number) => {
      if (playing) elapsedRef.current += now - last;
      last = now;
      const t = loopTime(segment, elapsedRef.current);
      // Frames are a pure function of t, so a paused preview only redraws when scrubbed.
      if (t !== drawn) {
        drawn = t;
        try {
          renderer.render(t);
        } catch (error) {
          if (!warned) console.error(error);
          warned = true;
        }
      }
      if (sliderRef.current) {
        sliderRef.current.max = String(Math.round(span));
        sliderRef.current.value = String(Math.round(t - segment.start));
      }
      if (timeRef.current) timeRef.current.textContent = `${clock(t - segment.start)} / ${clock(span)}`;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [assets, cssWidth, frame, timeline, quiz, framing, segment, playing]);

  return (
    <div className="space-y-2">
      <div
        ref={boxRef}
        className={`relative mx-auto w-full overflow-hidden rounded-2xl border border-ink-700 bg-ink-950 ${
          framing === "vertical" ? "max-w-[18rem]" : ""
        }`}
        style={{ aspectRatio: `${frame.cssWidth} / ${frame.cssHeight}` }}
      >
        <canvas
          ref={canvasRef}
          className="absolute inset-0 h-full w-full"
          role="img"
          aria-label={`${frame.label} preview, as it plays and exports`}
          data-preview-framing={framing}
        />
        {!ready && (
          <p className="absolute inset-0 grid place-items-center text-xs text-ink-500">
            {failed ? "Couldn't load the pictures for this preview." : "Loading preview…"}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPlaying((value) => !value)}
          className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800"
          aria-label={playing ? "Pause preview" : "Play preview"}
        >
          {playing ? "Pause" : "Play"}
        </button>
        <input
          ref={sliderRef}
          type="range"
          min={0}
          defaultValue={0}
          step={10}
          aria-label="Preview time"
          className="min-w-0 flex-1 accent-[var(--accent)]"
          onInput={(event) => {
            elapsedRef.current = Number(event.currentTarget.value);
          }}
        />
        <span ref={timeRef} className="w-24 shrink-0 whitespace-nowrap text-right font-mono text-[10px] text-ink-500" />
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-ink-500">Same renderer as the video export. Answers: clock runs out.</p>
        <button
          type="button"
          onClick={() => setResultsFor(showResults ? null : index)}
          className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800"
        >
          {showResults ? "Back to question" : "Show results"}
        </button>
      </div>
    </div>
  );
}
