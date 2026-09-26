"use client";

import { useState } from "react";
import type { Theme } from "@/types/quiz";
import { useElapsedSince } from "@/hooks/useElapsedSince";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { Button } from "@/components/ui/Button";
import { optionColor, themeAgeBand } from "@/lib/ageBands";
import { QUESTION_SWAP, TILE_IN, tileDelayMs } from "@/lib/playTiming";
import { cubicBezier } from "@/lib/videoExport/motion";
import {
  answerPoseAt,
  enterSpanMs,
  exitPhaseMs,
  poseStyle,
  questionPoseAt,
  swapOutDelayMs,
  typewriterChars,
  usesSwapIn,
  usesSwapOut,
  type ResolvedMotion,
} from "@/lib/stageMotion";

const PROMPT = "Which planet is known as the Red Planet?";
const ANSWERS = ["Venus", "Mars", "Jupiter", "Saturn"];
const HOLD_MS = 900;
const TAIL_MS = 400;
const swapEase = cubicBezier(QUESTION_SWAP.ease);
const SWAP_MS = QUESTION_SWAP.durationS * 1000;

/**
 * A miniature stage that plays one question in, holds, and plays it out —
 * computed frame by frame from the same pure pose functions the live stage and
 * the video exporter use (including the `default` swap + tile-in model).
 */
export function MotionPreview({ motion, theme, label }: { motion: ResolvedMotion; theme: Theme; label: string }) {
  const [run, setRun] = useState(0);
  const reduced = useReducedMotion();
  const band = themeAgeBand(theme);

  const defaultTiles = motion.answers.enter === "default" ? tileDelayMs(ANSWERS.length - 1) + TILE_IN.durationMs : 0;
  const enterMs = Math.max(usesSwapIn(motion) ? SWAP_MS : 0, defaultTiles, enterSpanMs(motion, ANSWERS.length, PROMPT));
  const exitAt = enterMs + HOLD_MS;
  const exitMs = exitPhaseMs(motion, ANSWERS.length);
  const total = exitAt + exitMs + TAIL_MS;

  // Replays whenever the settings change, or on demand.
  const key = `${run}|${JSON.stringify(motion)}`;
  const elapsed = useElapsedSince(key, total, reduced) ?? 0;
  // Reduced motion (or a finished run) parks on the settled middle frame.
  const t = Number.isFinite(elapsed) && elapsed < total ? elapsed : exitAt - 1;
  const sinceExit = t >= exitAt ? t - exitAt : null;

  // The stage-wide swap: in for `default` entrances, out after any custom exits.
  let swapOpacity = 1;
  let swapX = 0;
  if (usesSwapIn(motion) && t < SWAP_MS) {
    const e = swapEase(Math.min(1, t / SWAP_MS));
    swapOpacity = e;
    swapX = QUESTION_SWAP.offsetPx * (1 - e);
  }
  if (sinceExit !== null && usesSwapOut(motion)) {
    const e = swapEase(Math.min(1, Math.max(0, (sinceExit - swapOutDelayMs(motion, ANSWERS.length)) / SWAP_MS)));
    swapOpacity = 1 - e;
    swapX = -QUESTION_SWAP.offsetPx * e;
  }
  const gone = sinceExit !== null && sinceExit >= exitMs;

  const typing = motion.question.enter === "typewriter";
  const typed = typing ? typewriterChars(PROMPT, motion.question, t) : PROMPT.length;

  return (
    <div className="space-y-2">
      <div
        className="relative overflow-hidden rounded-xl border border-ink-700 bg-ink-950/80 p-3"
        role="img"
        aria-label={`${label} animation preview`}
      >
        <div
          style={{
            opacity: gone ? 0 : swapOpacity,
            transform: swapX ? `translateX(${swapX.toFixed(2)}px)` : undefined,
          }}
          className="flex flex-col gap-2"
        >
          <div className="text-[9px] font-semibold uppercase tracking-widest text-ink-400">Question 2 of 10</div>
          <p
            className="stage-prompt text-center text-sm font-bold"
            style={{ color: "var(--prompt-color)", ...poseStyle(questionPoseAt(motion.question, t, sinceExit)) }}
          >
            {PROMPT.slice(0, typed)}
            <span style={{ visibility: "hidden" }}>{PROMPT.slice(typed)}</span>
          </p>
          <div className="grid grid-cols-2 gap-1.5">
            {ANSWERS.map((answer, i) => {
              const bg = optionColor(i, { band, colors: theme.optionColors });
              return (
                <div
                  key={answer}
                  className="rounded-lg px-2 py-1.5 text-[11px] font-semibold text-white"
                  style={{ background: bg, ...poseStyle(answerPoseAt(motion.answers, i, t, sinceExit)) }}
                >
                  {answer}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-ink-500">Plays in, holds, plays out.</span>
        <Button variant="ghost" size="sm" onClick={() => setRun((n) => n + 1)} disabled={reduced}>
          ▶ Replay
        </Button>
      </div>
    </div>
  );
}
