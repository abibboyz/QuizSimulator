"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { Quiz, TimerPlacement } from "@/types/quiz";
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
  /** Saves a dragged timer spot for this framing. A click that does not move saves nothing. */
  onTimerPlace?: (point: TimerPlacement) => void;
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
export function FramedPreview({ quiz, index, framing, onTimerPlace }: Props) {
  const frame = FRAMINGS[framing];
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sliderRef = useRef<HTMLInputElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const rendererRef = useRef<FrameRenderer | null>(null);
  const handleRef = useRef<HTMLDivElement>(null);
  const lastTRef = useRef(0);
  const dragRef = useRef<{ mode: "move"; dx: number; dy: number } | { mode: "resize" } | null>(null);
  const placeHandleRef = useRef<() => void>(() => {});
  const pendingRef = useRef<TimerPlacement | null>(null);
  const onTimerPlaceRef = useRef(onTimerPlace);
  // eslint-disable-next-line react-hooks/refs -- intentional: syncs prop to ref each render so event handlers always see the latest value
  onTimerPlaceRef.current = onTimerPlace;
  // eslint-disable-next-line react-hooks/refs -- intentional: keeps rAF callback in sync with latest layout without re-running the animation effect
  placeHandleRef.current = () => {
    const handle = handleRef.current;
    const box = boxRef.current;
    const rect = rendererRef.current?.timerFrameRect();
    if (!handle || !box) return;
    if (!rect || rect.w <= 0) {
      handle.style.display = "none";
      return;
    }
    handle.style.display = "block";
    handle.style.left = `${((rect.x + rect.w) / frame.cssWidth) * box.clientWidth}px`;
    handle.style.top = `${((rect.y + rect.h / 2) / frame.cssHeight) * box.clientHeight}px`;
  };

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
    rendererRef.current = renderer;

    let id = 0;
    let last = performance.now();
    let warned = false;
    let drawn = Number.NaN;
    const span = segment.end - segment.start;
    const tick = (now: number) => {
      if (playing) elapsedRef.current += now - last;
      last = now;
      const t = loopTime(segment, elapsedRef.current);
      lastTRef.current = t;
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
      placeHandleRef.current();
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(id);
      rendererRef.current = null;
    };
  }, [assets, cssWidth, frame, timeline, quiz, framing, segment, playing]);

  const toFrame = (event: PointerEvent<HTMLDivElement>) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0 || box.height <= 0) return null;
    return {
      x: ((event.clientX - box.left) / box.width) * frame.cssWidth,
      y: ((event.clientY - box.top) / box.height) * frame.cssHeight,
    };
  };

  const grabSlop = () => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || box.width <= 0) return 16;
    return (14 / box.width) * frame.cssWidth;
  };

  const redraw = () => {
    const renderer = rendererRef.current;
    if (!renderer) return;
    try {
      renderer.render(lastTRef.current);
    } catch (error) {
      console.error(error);
    }
    placeHandleRef.current();
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    const renderer = rendererRef.current;
    const point = toFrame(event);
    const slop = grabSlop();
    if (!renderer || !point || !renderer.timerContains(point.x, point.y, slop)) return;
    const rect = renderer.timerFrameRect();
    if (!rect) return;
    event.currentTarget.focus();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = renderer.timerAtEnd(point.x, point.y, slop)
      ? { mode: "resize" }
      : { mode: "move", dx: point.x - rect.x, dy: point.y - rect.y };
    pendingRef.current = null;
    event.preventDefault();
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const renderer = rendererRef.current;
    const point = toFrame(event);
    if (!renderer || !point) return;
    const slop = grabSlop();
    if (!dragRef.current) {
      event.currentTarget.style.cursor = renderer.timerAtEnd(point.x, point.y, slop)
        ? "ew-resize"
        : renderer.timerContains(point.x, point.y, slop)
          ? "grab"
          : "";
      return;
    }
    event.currentTarget.style.cursor = dragRef.current.mode === "resize" ? "ew-resize" : "grabbing";
    const placed = dragRef.current.mode === "resize"
      ? renderer.resizeTimer(point.x)
      : renderer.moveTimer(point.x - dragRef.current.dx, point.y - dragRef.current.dy);
    if (placed) pendingRef.current = placed;
    redraw();
  };

  const endDrag = () => {
    const placed = pendingRef.current;
    dragRef.current = null;
    pendingRef.current = null;
    if (boxRef.current) boxRef.current.style.cursor = "";
    // A click that never moves leaves the timer in the header.
    if (placed) onTimerPlaceRef.current?.(placed);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight" && event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    const renderer = rendererRef.current;
    const rect = renderer?.timerFrameRect();
    if (!renderer || !rect) return;
    event.preventDefault();
    if (event.shiftKey && (event.key === "ArrowLeft" || event.key === "ArrowRight")) {
      const delta = frame.cssWidth * 0.04 * (event.key === "ArrowRight" ? 1 : -1);
      const placed = renderer.resizeTimer(rect.x + rect.w + delta);
      if (!placed) return;
      redraw();
      onTimerPlaceRef.current?.(placed);
      return;
    }
    const stepX = frame.cssWidth * 0.02;
    const stepY = frame.cssHeight * 0.02;
    const dx = event.key === "ArrowLeft" ? -stepX : event.key === "ArrowRight" ? stepX : 0;
    const dy = event.key === "ArrowUp" ? -stepY : event.key === "ArrowDown" ? stepY : 0;
    const placed = renderer.moveTimer(rect.x + dx, rect.y + dy);
    if (!placed) return;
    redraw();
    onTimerPlaceRef.current?.(placed);
  };

  return (
    <div className="space-y-2">
      <div
        ref={boxRef}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
        aria-label={`${frame.label} preview. Drag the timer to move it. Drag the dot on its end to change its length. Arrow keys move it, and shift plus left or right changes the length.`}
        className={`focus-ring relative mx-auto w-full overflow-hidden rounded-2xl border border-ink-700 bg-ink-950 ${
          framing === "vertical" ? "max-w-[18rem]" : ""
        }`}
        style={{ aspectRatio: `${frame.cssWidth} / ${frame.cssHeight}` }}
      >
        <canvas
          ref={canvasRef}
          className="pointer-events-none absolute inset-0 h-full w-full"
          role="img"
          aria-label={`${frame.label} preview, as it plays and exports`}
          data-preview-framing={framing}
        />
        <div
          ref={handleRef}
          data-timer-handle
          aria-hidden
          className="pointer-events-none absolute z-20 hidden h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-950 bg-white shadow"
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
        <p className="text-[11px] text-ink-500">
          Drag the timer to move it. Drag the dot on its end to make it longer or shorter. That spot and length are used in the {framing === "vertical" ? "mobile" : "web"} video. Leave it and it stays at the top right, at its original length.
        </p>
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
