"use client";

import { useEffect, type ReactNode } from "react";
import { usePresence } from "motion/react";
import type { Question, Theme } from "@/types/quiz";
import { MediaImage } from "@/components/ui/MediaImage";
import { AnswerGrid, type StageMode } from "@/components/play/AnswerGrid";
import { RevealPicture } from "@/components/play/RevealPicture";
import { useElapsedSince } from "@/hooks/useElapsedSince";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import {
  customExitMs,
  enterSpanMs,
  poseStyle,
  questionPoseAt,
  typewriterChars,
  type ResolvedMotion,
} from "@/lib/stageMotion";

interface Props {
  question: Question;
  index: number;
  total: number;
  selected: string[];
  revealed: boolean;
  interactive: boolean;
  onPick: (optionId: string) => void;
  mode: StageMode;
  /** Phone-shaped play: one answer per row. */
  narrow?: boolean;
  /** Timer, score, and anything else that belongs on the stage's top rail. */
  header?: ReactNode;
  /** Supplies the answer tiles' palette, label colour, and marker style. */
  theme: Theme;
  /**
   * Resolved entrance/exit animation (lib/stageMotion). Omitted — the builder
   * preview — or all-`default` renders exactly as before these settings existed.
   * Exits only run inside AnimatePresence (solo play).
   */
  motion?: ResolvedMotion;
}

const CAPTION_TEXT: Record<StageMode, string> = {
  host: "text-3xl",
  solo: "text-lg md:text-2xl",
  preview: "text-[9px]",
};

/** Reveal pictures keep one size throughout: shrinking at the reveal would undercut the reveal. */
function revealMaxHeight(mode: StageMode, leads: boolean): string {
  if (mode === "host") return leads ? "32vh" : "20vh";
  if (mode === "solo") return leads ? "26vh" : "22vh";
  return leads ? "3rem" : "2.5rem";
}

const PROMPT_TEXT: Record<StageMode, string> = {
  host: "text-4xl md:text-6xl leading-tight",
  solo: "text-xl md:text-3xl leading-snug",
  preview: "text-[11px] leading-snug",
};

const META_TEXT: Record<StageMode, string> = {
  host: "text-base",
  solo: "text-xs",
  preview: "text-[8px]",
};

/**
 * The single renderer used by solo play, host presentation, and the builder's
 * live preview. Keeping one component means a layout only has to be built once
 * and the preview can't drift from what actually plays.
 */
export function QuestionStage({
  question,
  index,
  total,
  selected,
  revealed,
  interactive,
  onPick,
  mode,
  narrow = false,
  header,
  theme,
  motion,
}: Props) {
  const imageLeads = question.layout === "image-top" && !!question.media;
  const isReveal = question.kind === "reveal";
  const reduced = useReducedMotion();

  // Stage animation clocks. With default motion both spans are 0, so neither
  // clock ever schedules a frame and nothing below changes today's render.
  const animated = mode !== "preview" && !!motion;
  const answerCount = question.options.length;
  const enterSpan = animated ? enterSpanMs(motion, answerCount, question.prompt) : 0;
  const exitSpan = animated && mode === "solo" ? customExitMs(motion, answerCount) : 0;
  const sinceMount = useElapsedSince(animated ? "mount" : null, enterSpan, reduced) ?? Infinity;
  // Holds AnimatePresence open for custom exits; the stage swap handles the rest.
  const [present, safeToRemove] = usePresence(exitSpan > 0);
  const leaving = exitSpan > 0 && !present;
  const sinceExit = useElapsedSince(leaving ? "exit" : null, exitSpan, reduced);

  useEffect(() => {
    if (!leaving || !safeToRemove) return;
    const id = window.setTimeout(safeToRemove, reduced ? 0 : exitSpan);
    return () => window.clearTimeout(id);
  }, [leaving, safeToRemove, exitSpan, reduced]);

  const questionStyle = animated ? poseStyle(questionPoseAt(motion.question, sinceMount, sinceExit)) : undefined;
  // The explanation only arrives at the reveal, so it takes the question's exit but not its entrance.
  const explanationStyle =
    animated && sinceExit !== null
      ? poseStyle(questionPoseAt({ ...motion.question, enter: "none" }, sinceMount, sinceExit))
      : undefined;

  const prompt = question.prompt;
  const typing = animated && motion.question.enter === "typewriter" && !!prompt;
  const typed = typing ? typewriterChars(prompt, motion.question, sinceMount) : 0;
  const promptChars = typing ? [...prompt] : [];
  // Host mode packs tighter: everything has to clear a 720p projector without
  // pushing the answer tiles under the control bar.
  const gap = mode === "preview" ? "gap-1.5" : mode === "host" ? "gap-3 md:gap-5" : "gap-6 md:gap-8";

  return (
    <div className={`flex w-full flex-col ${gap}`}>
      <div className="flex items-start justify-between gap-4">
        <span className={`font-semibold uppercase tracking-widest text-ink-300 ${META_TEXT[mode]}`}>
          Question {index + 1} of {total}
          {question.kind === "multi-select" && <span className="ml-2 text-ink-400">· pick all that apply</span>}
          {question.kind === "image-choice" && <span className="ml-2 text-ink-400">· pick an image</span>}
        </span>
        {header}
      </div>

      {imageLeads && isReveal && (
        <div className="flex justify-center" style={questionStyle}>
          <RevealPicture
            question={question}
            theme={theme}
            revealKey={revealed ? "reveal" : null}
            maxHeight={revealMaxHeight(mode, true)}
            instant={mode === "preview" || reduced}
            captionClass={CAPTION_TEXT[mode]}
            className="w-full"
          />
        </div>
      )}

      {imageLeads && !isReveal && (
        <div className="flex justify-center" style={questionStyle}>
          <MediaImage
            media={question.media}
            className={`rounded-2xl object-contain transition-[max-height] duration-300 ${
              mode === "host"
                ? revealed
                  ? "max-h-[22vh]"
                  : "max-h-[32vh]"
                : mode === "solo"
                  ? "max-h-[26vh]"
                  : "max-h-12"
            }`}
          />
        </div>
      )}

      <div className={imageLeads ? "" : "flex flex-col items-center gap-4"} style={questionStyle}>
        <h2
          className={`stage-prompt text-center font-bold ${PROMPT_TEXT[mode]}`}
          style={{ color: "var(--prompt-color)" }}
          aria-label={typing ? prompt : undefined}
        >
          {typing ? (
            <>
              {promptChars.slice(0, typed).join("")}
              {/* The untyped rest is laid out but invisible, so lines don't reflow as it types. */}
              <span aria-hidden style={{ visibility: "hidden" }}>
                {promptChars.slice(typed).join("")}
              </span>
            </>
          ) : (
            question.prompt || <span className="text-ink-500">Untitled question</span>
          )}
        </h2>

        {!imageLeads && isReveal && question.media && (
          <RevealPicture
            question={question}
            theme={theme}
            revealKey={revealed ? "reveal" : null}
            maxHeight={revealMaxHeight(mode, false)}
            instant={mode === "preview" || reduced}
            captionClass={CAPTION_TEXT[mode]}
            className="w-full"
          />
        )}

        {!imageLeads && !isReveal && question.media && (
          // The picture gives up height once the answer is out, so the
          // explanation lands on screen instead of below the fold.
          <MediaImage
            media={question.media}
            className={`rounded-2xl object-contain transition-[max-height] duration-300 ${
              mode === "host"
                ? revealed
                  ? "max-h-[12vh]"
                  : "max-h-[20vh]"
                : mode === "solo"
                  ? "max-h-[22vh]"
                  : "max-h-10"
            }`}
          />
        )}
      </div>

      <AnswerGrid
        question={question}
        selected={selected}
        revealed={revealed}
        interactive={interactive}
        onPick={onPick}
        mode={mode}
        narrow={narrow}
        theme={theme}
        motion={animated ? motion.answers : undefined}
        sinceMount={sinceMount}
        sinceExit={sinceExit}
      />

      {revealed &&
        question.explanation &&
        (() => {
          const card = (
            <div
              className={`animate-pop rounded-2xl border border-ink-600 bg-ink-900/80 text-center ${
                mode === "host" ? "px-5 py-2.5 text-lg" : mode === "solo" ? "px-5 py-4 text-sm" : "px-2 py-1 text-[9px]"
              }`}
              style={{ color: "var(--explanation-color)" }}
            >
              {question.explanation}
            </div>
          );
          // `.animate-pop` fills `both`, which would beat an inline exit pose on
          // the card itself — so a custom exit moves a wrapper instead. Decided
          // per question, so the card never remounts (and re-pops) mid-run.
          return exitSpan > 0 ? <div style={explanationStyle}>{card}</div> : card;
        })()}
    </div>
  );
}
