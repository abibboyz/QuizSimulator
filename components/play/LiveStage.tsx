"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePresence } from "motion/react";
import type { Question, Quiz } from "@/types/quiz";
import { canvasBackingSize } from "@/lib/canvasSize";
import { liveStageSize } from "@/lib/fitStage";
import { resolveReveal } from "@/lib/reveal";
import { customExitMs, resolveMotion } from "@/lib/stageMotion";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { loadAssets, releaseAssets } from "@/lib/videoExport/assets";
import { buildTimeline } from "@/lib/videoExport/timeline";
import { syncLiveTimeline } from "@/lib/videoExport/liveTimeline";
import { FrameRenderer, FRAMINGS, type AnswerFrameRect, type Framing, type GamePointer, type RenderAssets } from "@/lib/videoExport/renderer";
import type { StarChoice, StarState } from "@/lib/stars";

interface Props {
  quiz: Quiz;
  order: Question[];
  index: number;
  framing: Framing;
  selected: string[];
  revealed: boolean;
  remainingMs: number | null;
  limitSeconds: number | null;
  correct?: boolean;
  outcomes?: (boolean | null)[];
  interactive?: boolean;
  onPick?: (id: string) => void;
  onRevealComplete?: () => void;
  /** Present only while the live next-question wait is active and visible. */
  countdownSeconds?: number;
  /**
   * Game question types: whether the stage is live (nothing covering it). The game clock (remember phase,
   * pops, timed reveals) starts the first time this is true; omitted means "from the moment it mounts".
   */
  gameLive?: boolean;
  /** Star or Go: what the answer earned and what was chosen. Absent before the reveal. */
  stars?: { earned: number; choice: StarChoice | null; pot: number; goWorth: number; after: StarState; bankPoints?: number };
  /** Star or Go: the player tapped Star or Go. Without it the two buttons are drawn but not tappable (host mode). */
  onStarChoice?: (choice: StarChoice) => void;
}

/** Preview/export rendering, driven by live events instead of simulated answers.
 * The only DOM over the frame is accessible, transparent answer hit targets.
 */
export function LiveStage(props: Props) {
  const { quiz, order, index, framing, revealed, onRevealComplete } = props;
  const question = order[index];
  const frame = FRAMINGS[framing];
  const renderQuiz = useMemo(() => ({ ...quiz, questions: order }), [quiz, order]);
  const timeline = useMemo(() => buildTimeline(renderQuiz, { answerMode: "timeout", sound: false }), [renderQuiz]);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(props);
  const countdownStart = useRef<number | null>(null);
  useEffect(() => { latest.current = props; });
  const clock = useRef({ start: 0, revealAt: null as number | null, picks: new Map<string, number>(), exitAt: undefined as number | undefined, gameAt: null as number | null, starTapAt: null as number | null });
  const rendererRef = useRef<FrameRenderer | null>(null);
  const pointerRef = useRef<GamePointer | null>(null);
  const [assets, setAssets] = useState<RenderAssets | null>(null);
  const [failed, setFailed] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [targets, setTargets] = useState<AnswerFrameRect[]>([]);
  const targetsRef = useRef<AnswerFrameRect[]>([]);
  useEffect(() => { targetsRef.current = targets; }, [targets]);
  const stageRef = useRef<HTMLDivElement>(null);
  const isDrag = question.kind === "drag-match";
  /** A pointer event in frame CSS pixels (the renderer's coordinates). */
  const framePoint = (event: { clientX: number; clientY: number; pointerType: string }): GamePointer => {
    const box = stageRef.current?.getBoundingClientRect();
    if (!box || !box.width) return { x: 0, y: 0, down: false, grabbing: false, type: event.pointerType };
    return { x: (event.clientX - box.left) / box.width * frame.cssWidth, y: (event.clientY - box.top) / box.height * frame.cssHeight, down: false, grabbing: false, type: event.pointerType };
  };
  const reduced = useReducedMotion();
  const exitMs = reduced ? 0 : customExitMs(resolveMotion(quiz.settings, question), question.options.length);
  const [present, safeToRemove] = usePresence(exitMs > 0);
  useEffect(() => {
    if (present || !safeToRemove) return;
    clock.current.exitAt = performance.now() - clock.current.start;
    const timer = window.setTimeout(safeToRemove, exitMs);
    return () => window.clearTimeout(timer);
  }, [present, safeToRemove, exitMs]);

  useEffect(() => {
    if (!revealed || !onRevealComplete) return;
    const timer = window.setTimeout(onRevealComplete, question.kind === "reveal" ? resolveReveal(question).durationMs : 0);
    return () => window.clearTimeout(timer);
  }, [revealed, question, onRevealComplete]);

  useEffect(() => {
    const controller = new AbortController();
    let owned: RenderAssets | null = null;
    loadAssets(renderQuiz, undefined, controller.signal).then((result) => {
      if (controller.signal.aborted) { releaseAssets(result.assets); return; }
      owned = result.assets;
      setAssets(owned);
    }).catch((error) => {
      if (!controller.signal.aborted) { console.error(error); setFailed(true); }
    });
    return () => { controller.abort(); if (owned) releaseAssets(owned); };
  }, [renderQuiz]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () => {
      // Mobile stays phone-shaped even in a wide desktop browser.
      // Hit targets share the canvas's percentage coordinates in either mode.
      setSize(liveStageSize(viewport.clientWidth, viewport.clientHeight, frame.cssWidth, frame.cssHeight, framing === "vertical"));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [frame, framing]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!assets || !canvas || !size.width) return;
    const backing = canvasBackingSize(size.width, size.height, window.devicePixelRatio);
    canvas.width = backing.width;
    canvas.height = Math.round(backing.width * frame.cssHeight / frame.cssWidth);
    const renderer = new FrameRenderer(canvas, timeline, renderQuiz, framing, assets);
    rendererRef.current = renderer;
    if (!clock.current.start) clock.current.start = performance.now();
    let raf = 0;
    let previousTargets = "";
    const draw = (now: number) => {
      const live = latest.current;
      const t = now - clock.current.start;
      if (live.countdownSeconds === undefined) countdownStart.current = null;
      else if (countdownStart.current === null) countdownStart.current = t;
      if (live.revealed && clock.current.revealAt === null) clock.current.revealAt = t;
      const picks = clock.current.picks;
      for (const id of picks.keys()) if (!live.selected.includes(id)) picks.delete(id);
      for (const id of live.selected) if (!picks.has(id)) picks.set(id, t);
      if (live.gameLive !== false && clock.current.gameAt === null) clock.current.gameAt = t;
      if (live.stars?.choice && clock.current.starTapAt === null) clock.current.starTapAt = t;
      renderer.setPointer(pointerRef.current);
      syncLiveTimeline(timeline, {
        index: live.index, elapsedMs: t, remainingMs: live.remainingMs, limitSeconds: live.limitSeconds,
        gameAt: clock.current.gameAt,
        stars: live.stars ? { ...live.stars, choice: live.stars.choice, choiceAt: clock.current.starTapAt } : undefined,
        // In selection order (Sequence numbers its picks); other kinds only read the set.
        revealAt: clock.current.revealAt, picks: live.selected.map((optionId) => ({ optionId, at: picks.get(optionId) ?? t })),
        correct: live.correct ?? false, outcomes: live.outcomes ?? [], exitAt: clock.current.exitAt,
        countdown: countdownStart.current === null ? undefined : { at: countdownStart.current, seconds: live.countdownSeconds! },
      });
      const rects = renderer.renderLive(t, live.outcomes);
      const signature = JSON.stringify(rects);
      if (signature !== previousTargets) { previousTargets = signature; setTargets(rects); }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [assets, size, frame, framing, timeline, renderQuiz]);

  return (
    <div ref={viewportRef} className="relative h-full min-h-0 w-full overflow-hidden" data-live-stage={framing}>
      <div ref={stageRef} className="absolute left-1/2 top-1/2 overflow-hidden" style={{ width: size.width, height: size.height, transform: "translate(-50%, -50%)" }}
        onPointerMove={(event) => { if (isDrag && !pointerRef.current?.grabbing) pointerRef.current = { ...framePoint(event), down: false, grabbing: false }; }}
        onPointerLeave={() => { if (isDrag && !pointerRef.current?.grabbing) pointerRef.current = null; }}>
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" aria-hidden="true" />
        <h2 className="sr-only">{question.prompt || "Question image"}</h2>
        {targets.map((target) => {
          if (target.id === "@drag") {
            // The item to drag (drag-match). Answers stay tappable as the accessible alternative.
            return <div key={target.id} aria-hidden="true" data-drag-source className="absolute touch-none cursor-grab"
              onPointerDown={(event) => { if (!props.interactive) return; event.currentTarget.setPointerCapture(event.pointerId); pointerRef.current = framePoint(event); pointerRef.current.grabbing = true; pointerRef.current.down = true; }}
              onPointerMove={(event) => { if (pointerRef.current?.grabbing) { const p = framePoint(event); pointerRef.current = { ...p, grabbing: true, down: true }; } }}
              onPointerUp={(event) => {
                const grabbing = pointerRef.current?.grabbing;
                const p = framePoint(event);
                pointerRef.current = { ...p, down: false, grabbing: false };
                if (!grabbing) return;
                const hit = targetsRef.current.find((item) => !item.id.startsWith("@") && p.x >= item.x && p.x <= item.x + item.w && p.y >= item.y && p.y <= item.y + item.h);
                if (hit) props.onPick?.(hit.id);
              }}
              onPointerCancel={() => { pointerRef.current = null; }}
              style={{ left: `${target.x / frame.cssWidth * 100}%`, top: `${target.y / frame.cssHeight * 100}%`, width: `${target.w / frame.cssWidth * 100}%`, height: `${target.h / frame.cssHeight * 100}%` }} />;
          }
          if (target.id === "@star" || target.id === "@go") {
            const choice: StarChoice = target.id === "@star" ? "star" : "go";
            if (!props.onStarChoice) return null;
            return <button key={target.id} type="button" aria-label={choice === "star" ? `Star: bank ${props.stars?.pot ?? 0} stars` : "Go: keep your stars in the pot and carry on"}
              onClick={() => props.onStarChoice?.(choice)}
              className="absolute border-0 bg-transparent p-0 text-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
              style={{ left: `${target.x / frame.cssWidth * 100}%`, top: `${target.y / frame.cssHeight * 100}%`, width: `${target.w / frame.cssWidth * 100}%`, height: `${target.h / frame.cssHeight * 100}%` }} />;
          }
          const option = question.options.find((item) => item.id === target.id);
          if (!option) return null;
          return <button key={target.id} type="button" aria-label={option.text || `Answer ${question.options.indexOf(option) + 1}`}
            aria-pressed={props.selected.includes(target.id)} disabled={!props.interactive || !present}
            onClick={() => props.onPick?.(target.id)}
            className="absolute border-0 bg-transparent p-0 text-transparent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default"
            style={{ left: `${target.x / frame.cssWidth * 100}%`, top: `${target.y / frame.cssHeight * 100}%`, width: `${target.w / frame.cssWidth * 100}%`, height: `${target.h / frame.cssHeight * 100}%` }} />;
        })}
      </div>
      {(!assets || failed) && <p role="status" className="absolute inset-0 grid place-items-center">{failed ? "Could not load the question images. Please reload to try again." : "Loading question…"}</p>}
    </div>
  );
}
