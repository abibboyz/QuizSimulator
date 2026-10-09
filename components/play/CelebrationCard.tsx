"use client";

import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { motion, type MotionProps } from "motion/react";
import type { CelebrationAnimation, Question } from "@/types/quiz";
import { MediaImage } from "@/components/ui/MediaImage";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  animatesCelebrationFromAnswer,
  celebrationAnimation,
  hidesCelebrationBox,
  celebrationMotionMs,
  celebrationView,
  usesPhotoAssembly,
} from "@/lib/celebration";
import { assemblyPieces, motionFrames, pieceWindow, type PhotoAssemblyStyle } from "@/lib/photoAssembly";
import { promptFontStack } from "@/lib/promptText";
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
          animation={animation}
          durationMs={question.celebration?.durationMs}
          pieces={question.celebration?.pieces}
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
  animation,
  durationMs,
  pieces,
  className,
  style,
  children,
}: {
  question: Question;
  reduced: boolean;
  animation: CelebrationAnimation;
  durationMs?: number;
  pieces?: number;
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

  const entrance = celebrationEntrance(animation, durationMs, shouldTravel && origin ? origin : null, reduced);

  return (
    <motion.div
      data-celebration-card
      className={className}
      style={style}
      {...entrance}
    >
      {usesPhotoAssembly(animation) ? (
        <PhotoAssembly animation={animation} durationMs={durationMs} pieces={pieces} reduced={reduced}>{children}</PhotoAssembly>
      ) : children}
    </motion.div>
  );
}

function PhotoAssembly({
  animation,
  durationMs,
  pieces,
  reduced,
  children,
}: {
  animation: PhotoAssemblyStyle;
  durationMs?: number;
  pieces?: number;
  reduced: boolean;
  children: ReactNode;
}) {
  if (reduced) return <>{children}</>;
  const durationMsResolved = celebrationMotionMs(animation, durationMs);
  const duration = durationMsResolved / 1000;
  const parts = assemblyPieces(animation, pieces);
  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1] }}
        transition={{ duration, times: [0, 0.86, 1], ease: "easeOut" }}
      >
        {children}
      </motion.div>
      {parts.map((piece) => {
        const frames = motionFrames(piece);
        const timing = pieceWindow(piece.index, parts.length, durationMsResolved);
        return (
          <motion.div
            key={piece.index}
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ filter: "drop-shadow(0 8px 10px rgb(0 0 0 / 0.22))" }}
            initial={{ x: frames.x[0], y: frames.y[0], scale: frames.scale[0], rotate: frames.rotate[0], clipPath: frames.clipPath[0], opacity: 0 }}
            animate={{
              x: frames.x,
              y: frames.y,
              scale: frames.scale,
              rotate: frames.rotate,
              clipPath: frames.clipPath,
              opacity: [0, 1, 1, 0],
            }}
            transition={{
              duration: timing.span / 1000,
              delay: timing.delay / 1000,
              times: frames.times,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            {children}
          </motion.div>
        );
      })}
    </div>
  );
}

function celebrationEntrance(
  animation: CelebrationAnimation,
  durationMs: number | undefined,
  origin: TravelOrigin | null,
  reduced: boolean,
): Pick<MotionProps, "initial" | "animate" | "transition"> {
  if (reduced) return { initial: false };
  const source = origin
    ? { x: origin.x, y: origin.y, scaleX: origin.scaleX, scaleY: origin.scaleY, opacity: 0.72 }
    : { x: 0, y: 0, scale: 0.97, opacity: 0 };
  const final = { x: 0, y: 0, scaleX: 1, scaleY: 1, scale: 1, rotate: 0, opacity: 1, filter: "blur(0px)", clipPath: "inset(0% 0% 0% 0%)" };
  const duration = Math.min(1.5, celebrationMotionMs(animation, durationMs) / 1000);
  // The pieces themselves fly. The wrapper only carries an answer-tile travel,
  // and it stays visible so the silhouettes are not faded out underneath it.
  if (usesPhotoAssembly(animation)) {
    return {
      initial: origin
        ? { x: origin.x, y: origin.y, scaleX: origin.scaleX, scaleY: origin.scaleY, opacity: 1 }
        : { opacity: 1 },
      animate: { x: 0, y: 0, scaleX: 1, scaleY: 1, scale: 1, opacity: 1 },
      transition: { duration: origin ? 0.58 : 0.01, ease: [0.22, 1, 0.36, 1] },
    };
  }
  if (animation === "shooting-star") return {
    initial: { ...source, x: origin?.x ?? -320, y: origin?.y ?? -180, rotate: -20, scale: origin ? undefined : 0.45 },
    animate: { ...final, x: [origin?.x ?? -320, -80, 0], y: [origin?.y ?? -180, -110, 0], rotate: [-20, -8, 0] },
    transition: { duration, ease: [0.22, 1, 0.36, 1] },
  };
  if (animation === "fireworks") return { initial: { ...source, scale: 0.15 }, animate: { ...final, scale: [0.15, 1.12, 1] }, transition: { duration, ease: "easeOut" } };
  if (animation === "hearts") return { initial: { ...source, y: origin?.y ?? 240, scale: 0.65 }, animate: final, transition: { duration, ease: [0.22, 1, 0.36, 1] } };
  if (animation === "sparkle-wave") return { initial: { ...source, x: origin?.x ?? -220, filter: "blur(8px)" }, animate: final, transition: { duration, ease: [0.22, 1, 0.36, 1] } };
  if (animation === "pulse-ring") return { initial: { ...source, scale: 0.2 }, animate: { ...final, scale: [0.2, 1.08, 1] }, transition: { duration, ease: "easeOut" } };
  if (animation === "stamp") return { initial: { ...source, scale: 2.3, rotate: -16 }, animate: { ...final, scale: [2.3, 0.9, 1] }, transition: { duration, ease: "easeOut" } };
  return { initial: source, animate: final, transition: { duration: origin ? 0.58 : 0.28, ease: "easeOut" } };
}
