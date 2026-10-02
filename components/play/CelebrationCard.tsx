"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import type { CelebrationAnimation, Question } from "@/types/quiz";
import { MediaImage } from "@/components/ui/MediaImage";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  CELEBRATION_FOLLOW_MS,
  celebrationAnimation,
  celebrationMotionMs,
  celebrationView,
} from "@/lib/celebration";
import { promptFontStack } from "@/lib/promptText";
import { CUE_CONFETTI, STAR_LANES } from "@/lib/playTiming";
import type { StageMode } from "@/components/play/AnswerGrid";

/**
 * The correct-answer card, centred on the screen once a question's answer is
 * revealed. Rendered only by callers that already know the answer is showing.
 * A question that hasn't turned this on resolves to nothing.
 *
 * The frame only centres the card. It has no wash, so the stage stays visible
 * around a small card. Preview stays inside the preview frame (`absolute`).
 * The overlay ignores pointers, so Next / Reveal keep working underneath.
 */
export function CelebrationCard({
  question,
  mode,
  /** Stay inside the phone column instead of the whole browser window. */
  contained = false,
}: {
  question: Question;
  mode: StageMode;
  contained?: boolean;
}) {
  const view = celebrationView(question);
  const reduced = useReducedMotion();
  const animation = celebrationAnimation(question);
  if (!view) return null;

  // A picture card is the picture alone. Words are only for a card with no picture.
  const lines = view.images.length > 0 ? [] : view.lines.filter((line) => line.trim());
  const showCard = view.images.length > 0 || lines.length > 0;
  const frame = contained
    ? "absolute inset-0 z-30 overflow-hidden lg:rounded-[2rem]"
    : mode === "preview"
      ? "absolute inset-0 z-20 overflow-hidden"
      : "fixed inset-0 z-30";
  const picture =
    mode === "preview"
      ? "max-h-16 max-w-[7rem]"
      : view.images.length > 1
        ? "max-h-24 max-w-[6.5rem]"
        : "max-h-32 max-w-[12rem]";
  const answer = mode === "preview" ? "text-xs" : "text-lg";
  const shell =
    mode === "preview"
      ? "max-w-[min(9.5rem,100%)] rounded-xl px-3 py-2"
      : "max-w-[min(16rem,100%)] rounded-2xl px-4 py-3";

  return (
    <div
      className={`pointer-events-none ${frame} flex items-center justify-center p-6`}
      aria-hidden
      data-celebration={animation}
    >
      {showCard && (
        <div
          data-celebration-card
          className={`relative z-10 w-fit max-w-full ${shell} border border-ink-500 bg-ink-900 text-center ${
            reduced ? "" : "animate-pop"
          }`}
          style={{ boxShadow: "0 0 0 1px var(--accent-line), 0 16px 36px -18px rgb(0 0 0 / 0.55)" }}
        >
          {view.images.length > 0 && (
            <div className="flex flex-wrap items-end justify-center gap-3">
              {view.images.map((item, index) => (
                <MediaImage
                  key={`${item.media.kind}-${index}`}
                  media={item.media}
                  className={`mx-auto w-auto max-w-full rounded-xl bg-white object-contain ${picture}`}
                />
              ))}
            </div>
          )}
          {lines.length > 0 && (
            <div
              className={`font-extrabold text-ink-100 ${answer}`}
              style={{ fontFamily: promptFontStack("var(--quiz-font)") }}
            >
              {lines.map((line, index) => (
                <p key={`${line}-${index}`}>{line}</p>
              ))}
            </div>
          )}
        </div>
      )}
      {!reduced && animation !== "none" && <CelebrationMotion animation={animation} contained={contained} />}
    </div>
  );
}

/** Starts after the card's pop, so the answer is on screen before the motion. */
function CelebrationMotion({ animation, contained }: { animation: CelebrationAnimation; contained: boolean }) {
  const [go, setGo] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setGo(true), CELEBRATION_FOLLOW_MS);
    return () => window.clearTimeout(id);
  }, []);

  useEffect(() => {
    if (!go || animation !== "confetti") return;
    const canvas = canvasRef.current;
    const fire = contained && canvas ? confetti.create(canvas, { resize: true }) : confetti;
    const { bursts, ...common } = CUE_CONFETTI;
    for (const { x, y, angle } of bursts) void fire({ ...common, origin: { x, y }, angle });
    return () => {
      if (contained && canvas) fire.reset();
    };
  }, [go, animation, contained]);

  if (animation === "confetti") {
    if (!contained) return null;
    return <canvas ref={canvasRef} className="absolute inset-0 z-20 h-full w-full" aria-hidden />;
  }
  if (!go) return null;
  const holdMs = celebrationMotionMs(animation);
  if (animation === "stars") return <Stars holdMs={holdMs} />;
  if (animation === "pulse-ring") return <PulseRing holdMs={holdMs} />;
  return <Stamp holdMs={holdMs} />;
}

function Stars({ holdMs }: { holdMs: number }) {
  return (
    <div className="absolute inset-0 z-20 overflow-hidden" aria-hidden>
      {STAR_LANES.map((left, i) => (
        <motion.span
          key={left}
          initial={{ y: "-15%", opacity: 0, rotate: 0 }}
          animate={{ y: "110%", opacity: [0, 1, 1, 0], rotate: 220 }}
          transition={{ duration: holdMs / 1000, delay: (i % 5) * 0.12, ease: "easeIn" }}
          className="absolute text-3xl"
          style={{ left: `${left}%`, color: "var(--accent)" }}
        >
          ★
        </motion.span>
      ))}
    </div>
  );
}

function PulseRing({ holdMs }: { holdMs: number }) {
  return (
    <div className="absolute inset-0 z-20" aria-hidden>
      {[0, 0.18].map((delay) => (
        <motion.span
          key={delay}
          initial={{ scale: 0.2, opacity: 0.7 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: holdMs / 1000, delay, ease: "easeOut" }}
          className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border-4"
          style={{ borderColor: "var(--accent)" }}
        />
      ))}
    </div>
  );
}

function Stamp({ holdMs }: { holdMs: number }) {
  return (
    <div className="absolute inset-0 z-20 grid place-items-center" aria-hidden>
      <motion.span
        initial={{ scale: 2.4, opacity: 0, rotate: -18 }}
        animate={{ scale: [2.4, 0.9, 1], opacity: [0, 1, 1, 0], rotate: -12 }}
        transition={{ duration: holdMs / 1000, times: [0, 0.25, 0.4, 1], ease: "easeOut" }}
        className="rounded-3xl border-8 px-10 py-4 text-6xl font-extrabold uppercase tracking-widest"
        style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
      >
        ★
      </motion.span>
    </div>
  );
}
