"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion } from "motion/react";
import confetti from "canvas-confetti";
import type { CelebrationAnimation, Question } from "@/types/quiz";
import { MediaImage } from "@/components/ui/MediaImage";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  CELEBRATION_FOLLOW_MS,
  animatesCelebrationFromAnswer,
  celebrationAnimation,
  hidesCelebrationBox,
  celebrationMotionMs,
  celebrationView,
} from "@/lib/celebration";
import { promptFontStack } from "@/lib/promptText";
import { CUE_CONFETTI, STAR_LANES } from "@/lib/playTiming";
import type { StageMode } from "@/components/play/AnswerGrid";
import { hidesImageBoxes as resolvesHiddenImageBoxes } from "@/lib/imageChoice";

/**
 * The correct-answer card, centred on the screen once a question's answer is
 * revealed. Rendered only by callers that already know the answer is showing.
 * A question that hasn't turned this on resolves to nothing.
 *
 * The frame only centres the card. It has no wash, so the stage stays visible
 * around a small card. Preview stays inside the preview frame (`absolute`).
 * Mobile play is centred on the visible phone frame, even if the question
 * content makes its column taller than the viewport.
 * The overlay ignores pointers, so Next / Reveal keep working underneath.
 */
export function CelebrationCard({
  question,
  mode,
  /** Stay inside the phone column instead of the whole browser window. */
  contained = false,
  hideImageBoxes = false,
}: {
  question: Question;
  mode: StageMode;
  contained?: boolean;
  hideImageBoxes?: boolean;
}) {
  const view = celebrationView(question);
  const reduced = useReducedMotion();
  const animation = celebrationAnimation(question);
  if (!view) return null;

  // A picture card is the picture alone. Words are only for a card with no picture.
  const lines = view.images.length > 0 ? [] : view.lines.filter((line) => line.trim());
  const showCard = view.images.length > 0 || lines.length > 0;
  const imageOnly = view.images.length > 0 && hidesCelebrationBox(question, {
    hideImageBoxes: resolvesHiddenImageBoxes({ hideImageBoxes }, question),
  });
  const frame = contained
    ? "fixed inset-y-0 left-1/2 z-30 w-full max-w-[26rem] -translate-x-1/2 overflow-hidden lg:rounded-[2rem]"
    : mode === "preview"
      ? "absolute inset-0 z-20 overflow-hidden"
      : "fixed inset-0 z-30";
  const picture =
    mode === "preview"
      ? "max-h-32 max-w-[14rem]"
      : view.images.length > 1
        ? contained
          ? "max-h-40 max-w-[9rem]"
          : "max-h-48 max-w-[13rem]"
        : contained
          ? "max-h-[min(16rem,40dvh)] max-w-[20rem]"
          : "max-h-[min(20rem,50dvh)] max-w-[24rem]";
  const answer = mode === "preview" ? "text-base" : contained ? "text-2xl" : "text-3xl";
  const shell =
    imageOnly
      ? "p-0"
      : mode === "preview"
      ? "max-w-[min(19rem,100%)] rounded-xl px-4 py-3"
      : contained
        ? "max-w-[min(22rem,100%)] rounded-2xl px-5 py-4"
        : "max-w-[min(32rem,100%)] rounded-2xl px-6 py-5";

  return (
    <div
      className={`pointer-events-none ${frame} flex items-center justify-center p-6`}
      aria-hidden
      data-celebration={animation}
    >
      {showCard && (
        <RevealTravelCard
          question={question}
          reduced={reduced}
          className={`relative z-10 w-fit max-w-full ${shell} text-center ${imageOnly ? "" : "border border-ink-500 bg-ink-900"}`}
          style={imageOnly ? undefined : { boxShadow: "0 0 0 1px var(--accent-line), 0 16px 36px -18px rgb(0 0 0 / 0.55)" }}
        >
          {view.images.length > 0 && (
            <div className="flex flex-wrap items-end justify-center gap-3">
              {view.images.map((item, index) => (
                <MediaImage
                  key={`${item.media.kind}-${index}`}
                  media={item.media}
                  className={`mx-auto h-auto w-auto max-w-full object-contain ${imageOnly ? "" : "rounded-xl bg-white"} ${picture}`}
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
        </RevealTravelCard>
      )}
      {!reduced && animation !== "none" && <CelebrationMotion animation={animation} contained={contained} />}
    </div>
  );
}

interface TravelOrigin {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
}

function RevealTravelCard({
  question,
  reduced,
  className,
  style,
  children,
}: {
  question: Question;
  reduced: boolean;
  className: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const measureRef = useRef<HTMLDivElement>(null);
  const correct = animatesCelebrationFromAnswer(question)
    ? question.options.find((option) => option.correct)
    : undefined;
  const sourceKey = correct ? `${question.id}:${correct.id}` : null;
  const shouldTravel = !!sourceKey && !reduced;
  const [origin, setOrigin] = useState<TravelOrigin | false | null>(null);

  useLayoutEffect(() => {
    if (!sourceKey || reduced) return;
    const target = measureRef.current?.getBoundingClientRect();
    const source = Array.from(document.querySelectorAll<HTMLElement>("[data-reveal-source]"))
      .find((element) => element.dataset.revealSource === sourceKey)
      ?.getBoundingClientRect();
    const next = !source || !target || target.width <= 0 || target.height <= 0
      ? false
      : {
          x: source.left + source.width / 2 - (target.left + target.width / 2),
          y: source.top + source.height / 2 - (target.top + target.height / 2),
          scaleX: source.width / target.width,
          scaleY: source.height / target.height,
        };
    const frame = requestAnimationFrame(() => setOrigin(next));
    return () => cancelAnimationFrame(frame);
  }, [sourceKey, reduced]);

  if (shouldTravel && origin === null) {
    return <div ref={measureRef} className={className} style={{ ...style, visibility: "hidden" }}>{children}</div>;
  }

  return (
    <motion.div
      data-celebration-card
      className={className}
      style={style}
      initial={
        shouldTravel && origin
          ? { x: origin.x, y: origin.y, scaleX: origin.scaleX, scaleY: origin.scaleY, opacity: 0.75 }
          : reduced
            ? false
            : { scale: 0.97, opacity: 0 }
      }
      animate={{ x: 0, y: 0, scaleX: 1, scaleY: 1, scale: 1, opacity: 1 }}
      transition={origin ? { duration: 0.58, ease: [0.22, 1, 0.36, 1] } : { duration: 0.28, ease: "easeOut" }}
    >
      {children}
    </motion.div>
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
  if (["shooting-star", "fireworks", "hearts", "bubbles", "sparkle-wave"].includes(animation)) {
    return <ParticleMotion animation={animation} holdMs={holdMs} />;
  }
  if (animation === "pulse-ring") return <PulseRing holdMs={holdMs} />;
  return <Stamp holdMs={holdMs} />;
}

function ParticleMotion({ animation, holdMs }: { animation: CelebrationAnimation; holdMs: number }) {
  const seconds = holdMs / 1000;
  if (animation === "shooting-star") return <div className="absolute inset-0 z-20 overflow-hidden">{Array.from({ length: 7 }, (_, i) => <motion.span key={i} initial={{ x: "-20%", y: `${8 + i * 11}%`, opacity: 0 }} animate={{ x: "120%", y: `${48 + i * 11}%`, opacity: [0, 1, 1, 0] }} transition={{ duration: seconds, delay: i * 0.09, ease: "easeIn" }} className="absolute text-4xl" style={{ color: "var(--accent)", textShadow: "-22px -8px 12px var(--accent)" }}>★</motion.span>)}</div>;
  if (animation === "fireworks") return <div className="absolute inset-0 z-20 overflow-hidden">{[[28, 38], [70, 30], [52, 66]].flatMap(([x, y], burst) => Array.from({ length: 12 }, (_, i) => { const angle = i * Math.PI * 2 / 12; return <motion.span key={`${burst}-${i}`} initial={{ left: `${x}%`, top: `${y}%`, scale: 0, opacity: 0 }} animate={{ x: `${Math.cos(angle) * (10 + burst * 2)}vw`, y: `${Math.sin(angle) * (10 + burst * 2)}vh`, scale: [0, 1, 0.4], opacity: [0, 1, 0] }} transition={{ duration: seconds, delay: burst * 0.16, ease: "easeOut" }} className="absolute h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />; }))}</div>;
  if (animation === "hearts") return <div className="absolute inset-0 z-20 overflow-hidden">{STAR_LANES.map((left, i) => <motion.span key={left} initial={{ y: "110%", opacity: 0 }} animate={{ y: "-15%", x: [0, i % 2 ? 24 : -24, 0], opacity: [0, 1, 1, 0] }} transition={{ duration: seconds, delay: (i % 6) * 0.08, ease: "easeOut" }} className="absolute text-3xl" style={{ left: `${left}%`, color: "var(--accent)" }}>♥</motion.span>)}</div>;
  if (animation === "bubbles") return <div className="absolute inset-0 z-20 overflow-hidden">{STAR_LANES.map((left, i) => <motion.span key={left} initial={{ y: "108%", opacity: 0, scale: 0.4 }} animate={{ y: "-12%", opacity: [0, 0.75, 0.75, 0], scale: [0.4, 1 + (i % 3) * 0.25] }} transition={{ duration: seconds, delay: (i % 5) * 0.1, ease: "linear" }} className="absolute h-8 w-8 rounded-full border-2" style={{ left: `${left}%`, borderColor: "var(--accent)" }} />)}</div>;
  return <div className="absolute inset-0 z-20 flex items-center justify-around overflow-hidden">{Array.from({ length: 15 }, (_, i) => <motion.span key={i} initial={{ opacity: 0, scale: 0 }} animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0], y: [0, i % 2 ? 45 : -45, 0] }} transition={{ duration: seconds, delay: i * 0.045, ease: "easeInOut" }} className="text-4xl" style={{ color: "var(--accent)" }}>✦</motion.span>)}</div>;
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
