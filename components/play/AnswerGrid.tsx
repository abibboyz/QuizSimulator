"use client";

import type { Question } from "@/types/quiz";
import { optionStyle } from "@/lib/themes";
import { MediaImage } from "@/components/ui/MediaImage";

export type StageMode = "solo" | "host" | "preview";

interface Props {
  question: Question;
  selected: string[];
  revealed: boolean;
  interactive: boolean;
  onPick: (optionId: string) => void;
  mode: StageMode;
}

const TEXT: Record<StageMode, string> = {
  host: "text-2xl md:text-3xl",
  solo: "text-base md:text-lg",
  preview: "text-[10px]",
};

const PAD: Record<StageMode, string> = {
  host: "p-5 min-h-24",
  solo: "p-4 min-h-20",
  preview: "p-1.5 min-h-8",
};

export function AnswerGrid({ question, selected, revealed, interactive, onPick, mode }: Props) {
  const columns =
    question.layout === "list"
      ? "grid-cols-1"
      : question.options.length <= 2
        ? "grid-cols-1 sm:grid-cols-2"
        : "grid-cols-1 sm:grid-cols-2";

  const gap = mode === "preview" ? "gap-1" : "gap-3 md:gap-4";

  return (
    <div className={`grid w-full ${columns} ${gap}`} role={question.kind === "multi-select" ? "group" : undefined}>
      {question.options.map((option, index) => {
        const style = optionStyle(index);
        const isPicked = selected.includes(option.id);

        // Once revealed, the correct answer always lights up — including when
        // nobody picked it, which is the moment the room actually learns something.
        const showCorrect = revealed && option.correct;
        const showWrong = revealed && isPicked && !option.correct;
        const faded = revealed && !option.correct && !isPicked;

        return (
          <button
            key={option.id}
            type="button"
            disabled={!interactive}
            onClick={() => onPick(option.id)}
            aria-pressed={isPicked}
            className={`focus-ring relative flex items-center gap-3 overflow-hidden rounded-2xl text-left font-semibold transition-all duration-200 ${PAD[mode]} ${TEXT[mode]} ${
              interactive ? "cursor-pointer hover:brightness-110 active:scale-[0.99]" : "cursor-default"
            } ${faded ? "opacity-35 saturate-50" : "opacity-100"} ${
              isPicked && !revealed ? "ring-4 ring-white/70" : ""
            } ${showCorrect ? "ring-4 ring-white shadow-[0_0_40px_-6px_rgba(34,197,94,0.9)]" : ""} ${
              showWrong ? "ring-4 ring-white/40" : ""
            }`}
            style={{
              background: showCorrect ? "var(--color-good)" : showWrong ? "var(--color-bad)" : style.bg,
              color: "#fff",
            }}
          >
            <span aria-hidden className={`shrink-0 opacity-90 ${mode === "preview" ? "text-xs" : "text-2xl"}`}>
              {style.shape}
            </span>

            {option.media && (
              <MediaImage
                media={option.media}
                className={`shrink-0 rounded-lg object-cover ${
                  mode === "host" ? "h-24 w-24" : mode === "solo" ? "h-14 w-14" : "h-6 w-6"
                }`}
              />
            )}

            <span className="min-w-0 flex-1 break-words">{option.text}</span>

            {revealed && (option.correct || isPicked) && (
              <span aria-hidden className={mode === "preview" ? "text-xs" : "text-2xl"}>
                {option.correct ? "✓" : "✕"}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
