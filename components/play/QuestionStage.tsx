"use client";

import type { ReactNode } from "react";
import type { Question, Theme } from "@/types/quiz";
import { MediaImage } from "@/components/ui/MediaImage";
import { AnswerGrid, type StageMode } from "@/components/play/AnswerGrid";

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
}: Props) {
  const imageLeads = question.layout === "image-top" && !!question.media;
  // Host mode packs tighter: everything has to clear a 720p projector without
  // pushing the answer tiles under the control bar.
  const gap = mode === "preview" ? "gap-1.5" : mode === "host" ? "gap-3 md:gap-5" : "gap-6 md:gap-8";

  return (
    <div className={`flex w-full flex-col ${gap}`}>
      <div className="flex items-start justify-between gap-4">
        <span className={`font-semibold uppercase tracking-widest text-ink-300 ${META_TEXT[mode]}`}>
          Question {index + 1} of {total}
          {question.kind === "multi-select" && <span className="ml-2 text-ink-400">· pick all that apply</span>}
        </span>
        {header}
      </div>

      {imageLeads && (
        <div className="flex justify-center">
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

      <div className={imageLeads ? "" : "flex flex-col items-center gap-4"}>
        <h2
          className={`stage-prompt text-center font-bold ${PROMPT_TEXT[mode]}`}
          style={{ color: "var(--prompt-color)" }}
        >
          {question.prompt || <span className="text-ink-500">Untitled question</span>}
        </h2>

        {!imageLeads && question.media && (
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
      />

      {revealed && question.explanation && (
        <div
          className={`animate-pop rounded-2xl border border-ink-600 bg-ink-900/80 text-center ${
            mode === "host" ? "px-5 py-2.5 text-lg" : mode === "solo" ? "px-5 py-4 text-sm" : "px-2 py-1 text-[9px]"
          }`}
          style={{ color: "var(--explanation-color)" }}
        >
          {question.explanation}
        </div>
      )}
    </div>
  );
}
