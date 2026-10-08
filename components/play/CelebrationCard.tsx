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
} from "@/lib/celebration";
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
          boxed={!imageOnly}
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
  boxed,
  className,
  style,
  children,
}: {
  question: Question;
  reduced: boolean;
  animation: CelebrationAnimation;
  durationMs?: number;
  boxed: boolean;
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
      {isPhotoAssembly(animation) ? (
        <PhotoAssembly animation={animation} durationMs={durationMs} boxed={boxed}>{children}</PhotoAssembly>
      ) : children}
    </motion.div>
  );
}

type PhotoAssemblyAnimation =
  | "bubbles"
  | "butterfly"
  | "stars"
  | "glass-assemble"
  | "mosaic-assemble"
  | "spiral-assemble"
  | "curtain-assemble"
  | "flip-assemble"
  | "zoom-assemble";

function isPhotoAssembly(animation: CelebrationAnimation): animation is PhotoAssemblyAnimation {
  return ["bubbles", "butterfly", "stars", "glass-assemble", "mosaic-assemble", "spiral-assemble", "curtain-assemble", "flip-assemble", "zoom-assemble"].includes(animation);
}

function PhotoAssembly({
  animation,
  durationMs,
  boxed,
  children,
}: {
  animation: PhotoAssemblyAnimation;
  durationMs?: number;
  boxed: boolean;
  children: ReactNode;
}) {
  const duration = celebrationMotionMs(animation, durationMs) / 1000;
  return (
    <div className="relative">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0, 1] }}
        transition={{ duration, times: [0, 0.86, 1], ease: "easeOut" }}
      >
        {children}
      </motion.div>
      {Array.from({ length: 9 }, (_, index) => {
        const col = index % 3;
        const row = Math.floor(index / 3);
        const clipPath = boxed
          ? "inset(0% 0% 0% 0%)"
          : `inset(${row * 33.333}% ${(2 - col) * 33.333}% ${(2 - row) * 33.333}% ${col * 33.333}%)`;
        const angle = index / 9 * Math.PI * 2;
        const initial = animation === "bubbles"
          ? { x: (col - 1) * 42, y: 230 + row * 38, scale: 0.18, rotate: 0, borderRadius: "50%" }
          : animation === "butterfly"
            ? { x: (col < 1 ? -1 : 1) * (boxed ? 330 + row * 70 : 210 + row * 45), y: Math.sin(index * 1.7) * (boxed ? 210 : 120), scale: boxed ? 0.12 : 0.45, rotate: (col < 1 ? -1 : 1) * 38, rotateY: (col < 1 ? -1 : 1) * 72, borderRadius: "18%" }
            : animation === "curtain-assemble"
              ? { x: 0, y: (col % 2 ? 1 : -1) * (260 + row * 40), scale: 1, rotate: 0, borderRadius: "0%" }
              : animation === "flip-assemble"
                ? { x: (col - 1) * 35, y: (row - 1) * 28, scale: 0.8, rotate: 0, rotateY: index % 2 ? 90 : -90, borderRadius: "0%" }
                : animation === "zoom-assemble"
                  ? { x: (col - 1) * 55, y: (row - 1) * 42, scale: 2.8, rotate: 0, borderRadius: "0%" }
                  : animation === "mosaic-assemble"
                    ? { x: (index % 2 ? 1 : -1) * (90 + col * 35), y: (row - 1) * 120, scale: 0.55, rotate: (index - 4) * 11, borderRadius: "0%" }
                    : animation === "glass-assemble"
                      ? { x: Math.cos(angle) * 240, y: Math.sin(angle) * 190, scale: 0.7, rotate: index * 47, borderRadius: "0%" }
                      : { x: Math.cos(angle) * (animation === "spiral-assemble" ? 330 : 280), y: Math.sin(angle) * (animation === "spiral-assemble" ? 260 : 220), scale: 0.22, rotate: animation === "spiral-assemble" ? index * 95 : index * 34, borderRadius: "0%" };
        const startX = initial.x;
        const startY = initial.y;
        const pieceMotion = animation === "butterfly"
          ? {
              x: [startX, startX * 0.78 + (index % 2 ? 70 : -70), startX * 0.4 + (index % 2 ? 65 : -65), 0],
              y: [startY, startY - (boxed ? 120 : 65), startY * 0.25 + (index % 3 - 1) * (boxed ? 70 : 38), 0],
              scale: [initial.scale, boxed ? 0.2 : 0.56, boxed ? 0.55 : 0.82, 1],
              rotate: [initial.rotate, -initial.rotate * 0.45, initial.rotate * 0.2, 0],
              rotateY: [initial.rotateY ?? 70, -(initial.rotateY ?? 70) * 0.7, (initial.rotateY ?? 70) * 0.4, 0],
            }
          : animation === "bubbles"
            ? { x: [startX, startX + (index % 2 ? 48 : -48), startX * 0.25, 0], y: [startY, 95 - row * 25, -18, 0], scale: [initial.scale, 0.48, 1.06, 1], rotate: [0, index % 2 ? 12 : -12, 0, 0], rotateY: [0, 22, -12, 0] }
            : animation === "stars"
              ? { x: [startX, startX * 0.48, startX * 0.14, 0], y: [startY, startY * 0.5 - 45, startY * 0.12, 0], scale: [initial.scale, 0.48, 0.86, 1], rotate: [initial.rotate, initial.rotate * 0.5, -8, 0], rotateY: [55, -35, 16, 0] }
              : animation === "spiral-assemble"
                ? { x: [startX, -startY * 0.72, startX * -0.28, 0], y: [startY, startX * 0.55, startY * -0.22, 0], scale: [initial.scale, 0.5, 0.82, 1], rotate: [initial.rotate, initial.rotate * 0.68, 120, 0], rotateY: [65, -45, 22, 0] }
                : animation === "curtain-assemble"
                  ? { x: [startX, (col - 1) * 38, 0], y: [startY, startY * 0.35, 0], scale: [1, 0.92, 1], rotate: [0, col % 2 ? 8 : -8, 0], rotateY: [col % 2 ? 68 : -68, col % 2 ? -18 : 18, 0] }
                  : animation === "flip-assemble"
                    ? { x: [startX, startX * 0.35, 0], y: [startY, startY - 35, 0], scale: [initial.scale, 0.9, 1], rotate: [0, index % 2 ? 12 : -12, 0], rotateY: [initial.rotateY ?? 90, -(initial.rotateY ?? 90) * 0.45, 0] }
                    : animation === "zoom-assemble"
                      ? { x: [startX, startX * 0.3, 0], y: [startY, startY * 0.3, 0], scale: [initial.scale, 1.55, 0.92, 1], rotate: [0, index % 2 ? 7 : -7, 0, 0], rotateY: [35, -18, 0, 0] }
                      : { x: [startX, startX * 0.42, 0], y: [startY, startY * 0.38, 0], scale: [initial.scale, 0.82, 1], rotate: [initial.rotate, initial.rotate * 0.3, 0], rotateY: [index % 2 ? 58 : -58, index % 2 ? -20 : 20, 0] };
        return (
          <motion.div
            key={index}
            className="pointer-events-none absolute inset-0 overflow-hidden"
            style={{ clipPath, transformPerspective: 900, transformStyle: "preserve-3d", filter: "drop-shadow(0 8px 10px rgb(0 0 0 / 0.22))" }}
            initial={{ ...initial, opacity: 0 }}
            animate={{ ...pieceMotion, borderRadius: "0%", opacity: [0, 1, 1, 0] }}
            transition={{ duration, delay: index * 0.055, times: [0, 0.1, 0.86, 1], ease: [0.22, 1, 0.36, 1] }}
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
  const authoredDuration = celebrationMotionMs(animation, durationMs) / 1000;
  const duration = isPhotoAssembly(animation) ? authoredDuration : Math.min(1.5, authoredDuration);
  if (animation === "shooting-star") return {
    initial: { ...source, x: origin?.x ?? -320, y: origin?.y ?? -180, rotate: -20, scale: origin ? undefined : 0.45 },
    animate: { ...final, x: [origin?.x ?? -320, -80, 0], y: [origin?.y ?? -180, -110, 0], rotate: [-20, -8, 0] },
    transition: { duration, ease: [0.22, 1, 0.36, 1] },
  };
  if (animation === "glass-assemble") return {
    initial: { ...source, scale: 1.18, opacity: 0, filter: "blur(12px)", clipPath: "polygon(0 0, 18% 8%, 8% 45%, 30% 62%, 12% 100%, 0 100%)" },
    animate: { ...final, opacity: [0, 0.55, 1], scale: [1.18, 0.96, 1], clipPath: ["polygon(0 0, 18% 8%, 8% 45%, 30% 62%, 12% 100%, 0 100%)", "polygon(0 0, 72% 0, 58% 34%, 100% 45%, 78% 100%, 0 100%)", "inset(0% 0% 0% 0%)"] },
    transition: { duration, ease: "easeOut" },
  };
  if (animation === "fireworks") return { initial: { ...source, scale: 0.15 }, animate: { ...final, scale: [0.15, 1.12, 1] }, transition: { duration, ease: "easeOut" } };
  if (animation === "hearts") return { initial: { ...source, y: origin?.y ?? 240, scale: 0.65 }, animate: final, transition: { duration, ease: [0.22, 1, 0.36, 1] } };
  if (animation === "bubbles") return { initial: { ...source, y: origin?.y ?? 220, scale: 0.35, opacity: 0 }, animate: { ...final, y: [origin?.y ?? 220, -20, 0], scale: [0.35, 1.06, 1] }, transition: { duration, ease: "easeOut" } };
  if (animation === "butterfly") return { initial: source, animate: final, transition: { duration, ease: [0.22, 1, 0.36, 1] } };
  if (["mosaic-assemble", "spiral-assemble", "curtain-assemble", "flip-assemble", "zoom-assemble"].includes(animation)) return { initial: source, animate: final, transition: { duration, ease: [0.22, 1, 0.36, 1] } };
  if (animation === "sparkle-wave") return { initial: { ...source, x: origin?.x ?? -220, filter: "blur(8px)" }, animate: final, transition: { duration, ease: [0.22, 1, 0.36, 1] } };
  if (animation === "stars") return { initial: { ...source, y: origin?.y ?? -180, rotate: -8 }, animate: final, transition: { duration, ease: "easeOut" } };
  if (animation === "pulse-ring") return { initial: { ...source, scale: 0.2 }, animate: { ...final, scale: [0.2, 1.08, 1] }, transition: { duration, ease: "easeOut" } };
  if (animation === "stamp") return { initial: { ...source, scale: 2.3, rotate: -16 }, animate: { ...final, scale: [2.3, 0.9, 1] }, transition: { duration, ease: "easeOut" } };
  return { initial: source, animate: final, transition: { duration: origin ? 0.58 : 0.28, ease: "easeOut" } };
}
