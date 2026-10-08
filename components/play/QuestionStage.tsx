"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePresence } from "motion/react";
import type { Question, QuizSettings, Theme } from "@/types/quiz";
import { LoopMotion } from "@/components/play/LoopMotion";
import { resolveLoops } from "@/lib/loopMotion";
import { PromptCanvas } from "@/components/play/PromptCanvas";
import { isUnscoredImage } from "@/lib/answerPresentation";
import { promptAnimationSpan } from "@/lib/promptDesign";
import { promptPosition } from "@/lib/questionPresentation";
import { promptAlign } from "@/lib/promptText";
import { MediaImage } from "@/components/ui/MediaImage";
import { hidesImageBoxes } from "@/lib/imageChoice";
import { AnswerGrid, type StageMode } from "@/components/play/AnswerGrid";
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
  loopSettings?: Pick<QuizSettings, "loopMotion" | "hideImageBoxes">;
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
  onPositionChange?: (placement: NonNullable<Question["promptPlacement"]>) => void;
  onRevealComplete?: () => void;
  promptReplay?: number;
  /**
   * The "Question N of X" label and the question-type hint (quiz setting
   * `showProgressBar`). Off drops both; `header` (timer, score) still shows, and
   * with no header the whole top row collapses. Defaults to shown.
   */
  showCount?: boolean;
}

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
  loopSettings = {},
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
  onPositionChange,
  onRevealComplete,
  promptReplay = 0,
  showCount = true,
}: Props) {
  const loops = resolveLoops(loopSettings, question);
  const hideImageBoxes = hidesImageBoxes(loopSettings, question);
  const placement = question.promptPlacement;
  const overlay = placement?.mode === "overlay" && !!question.media;
  const bottom = placement?.mode === "bottom";
  const canvasRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);
  const imageLeads = question.layout === "image-top" && !!question.media;
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
  const textAnimation = question.promptStyle?.textAnimation;
  const typing = animated && motion.question.enter === "typewriter" && !textAnimation && !!prompt;
  const typed = typing ? typewriterChars(prompt, motion.question, sinceMount) : Infinity;
  const textElapsed = useElapsedSince(textAnimation ? `${question.id}-${promptReplay}-${prompt}-${JSON.stringify(textAnimation)}` : null,
    textAnimation ? promptAnimationSpan(prompt, textAnimation) * (textAnimation.repeat === null ? Infinity : Math.max(1, textAnimation.repeat ?? 1)) : 0, reduced) ?? Infinity;
  const align = promptAlign(question.promptStyle);
  const aligned = align !== "center";
  // Host mode packs tighter: everything has to clear a 720p projector without
  // pushing the answer tiles under the control bar.
  const gap = mode === "preview" ? "gap-1.5" : mode === "host" ? "gap-3 md:gap-5" : "gap-6 md:gap-8";

  const promptNode = (
    <div className="w-full"><LoopMotion value={loops.question} preview={mode === "preview"}>
      <PromptCanvas question={question} theme={theme} elapsed={textElapsed} typed={typed} />
    </LoopMotion></div>
  );

  return (
    <div className={`flex w-full flex-col ${gap}`}>
      {(showCount || header) && <div className={`flex items-start gap-4 ${showCount ? "justify-between" : "justify-end"}`}>
        {showCount && <span className={`font-semibold uppercase tracking-widest text-ink-300 ${META_TEXT[mode]}`}>
          Question {index + 1} of {total}
          {question.kind === "multi-select" && <span className="ml-2 text-ink-400">· pick all that apply</span>}
          {question.kind === "image-choice" && <span className="ml-2 text-ink-400">· {isUnscoredImage(question) ? "look and decide" : "pick an image"}</span>}
          {question.kind === "reveal" && <span className="ml-2 text-ink-400">· pick a cover</span>}
        </span>}
        {header}
      </div>}

      {imageLeads && !overlay && (
        <div className={aligned ? `flex w-full ${align === "right" ? "justify-end" : "justify-start"}` : "flex justify-center"} style={questionStyle}>
          <LoopMotion value={loops.question} preview={mode === "preview"}>
          <MediaImage
            media={question.media}
            className={`${hideImageBoxes ? "" : "rounded-2xl"} object-contain transition-[max-height] duration-300 ${
              mode === "host"
                ? revealed
                  ? "max-h-[22vh]"
                  : "max-h-[32vh]"
                : mode === "solo"
                  ? "max-h-[26vh]"
                  : "max-h-12"
            }`}
          />
          </LoopMotion>
        </div>
      )}

      {((!overlay && !bottom) || (!overlay && !imageLeads && question.media)) && <div className={imageLeads ? "" : aligned ? "flex w-full flex-col items-stretch gap-4" : "flex flex-col items-center gap-4"} style={questionStyle}>
        {!overlay && !bottom && promptNode}

        {!overlay && !imageLeads && question.media && (
          // The picture gives up height once the answer is out, so the
          // explanation lands on screen instead of below the fold.
          <LoopMotion value={loops.question} preview={mode === "preview"}>
          <div className={aligned ? `flex w-full ${align === "right" ? "justify-end" : "justify-start"}` : "flex justify-center"}>
          <MediaImage
            media={question.media}
            className={`${hideImageBoxes ? "" : "rounded-2xl"} object-contain transition-[max-height] duration-300 ${
              mode === "host"
                ? revealed
                  ? "max-h-[12vh]"
                  : "max-h-[20vh]"
                : mode === "solo"
                  ? "max-h-[22vh]"
                  : "max-h-10"
            }`}
          />
          </div>
          </LoopMotion>
        )}
      </div>}

      {overlay && (
        <div ref={canvasRef} className={`relative mx-auto w-full overflow-hidden ${hideImageBoxes ? "" : "rounded-xl"}`} style={{ maxWidth: mode === "host" ? "40vh" : undefined, aspectRatio: "16 / 9" }}>
          <div className="absolute inset-0"><LoopMotion value={loops.question} preview={mode === "preview"}><MediaImage media={question.media} className="h-full w-full object-contain" /></LoopMotion></div>
          <div
            role={onPositionChange ? "button" : undefined}
            tabIndex={onPositionChange ? 0 : undefined}
            aria-label={onPositionChange ? "Drag prompt or use arrow keys to position" : undefined}
            className={onPositionChange ? "focus-ring absolute cursor-grab touch-none select-none" : "absolute"}
            style={{ width: "80%", maxHeight: "100%", overflow: "auto", left: `${promptPosition(placement?.x)}%`, top: `${promptPosition(placement?.y)}%`, transform: `translate(-${promptPosition(placement?.x)}%, -${promptPosition(placement?.y)}%)` }}
            onPointerDown={(event) => {
              if (!onPositionChange) return;
              event.currentTarget.setPointerCapture(event.pointerId);
              drag.current = { x: event.clientX, y: event.clientY, left: promptPosition(placement?.x), top: promptPosition(placement?.y) };
            }}
            onPointerMove={(event) => {
              if (!drag.current || !onPositionChange || !canvasRef.current) return;
              const bounds = canvasRef.current.getBoundingClientRect();
              const target = event.currentTarget.getBoundingClientRect();
              onPositionChange({ mode: "overlay", x: promptPosition(drag.current.left + (event.clientX - drag.current.x) / Math.max(1, bounds.width - target.width) * 100), y: promptPosition(drag.current.top + (event.clientY - drag.current.y) / Math.max(1, bounds.height - target.height) * 100) });
            }}
            onPointerUp={() => { drag.current = null; }}
            onPointerCancel={() => { drag.current = null; }}
            onLostPointerCapture={() => { drag.current = null; }}
            onKeyDown={(event) => {
              if (!onPositionChange || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
              event.preventDefault();
              onPositionChange({ mode: "overlay", x: promptPosition(promptPosition(placement?.x) + (event.key === "ArrowLeft" ? -2 : event.key === "ArrowRight" ? 2 : 0)), y: promptPosition(promptPosition(placement?.y) + (event.key === "ArrowUp" ? -2 : event.key === "ArrowDown" ? 2 : 0)) });
            }}
          ><div style={questionStyle}>{promptNode}</div></div>
        </div>
      )}

      {bottom && <div style={questionStyle}>{promptNode}</div>}

      <AnswerGrid
        loops={loops}
        hideImageBoxes={hideImageBoxes}
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
        onRevealComplete={onRevealComplete}
      />

      {revealed && !isUnscoredImage(question) &&
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
