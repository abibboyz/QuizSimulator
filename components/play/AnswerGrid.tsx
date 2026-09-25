"use client";

import type { Question, Theme } from "@/types/quiz";
import { DEFAULT_CORRECT_COLOR, DEFAULT_WRONG_COLOR, readableTextOn, withAlpha } from "@/lib/themes";
import { optionColor, optionMarker, themeAgeBand } from "@/lib/ageBands";
import { DEFAULT_IMAGE_GAP, imageChoiceGridStyle } from "@/lib/imageChoice";
import { MediaImage } from "@/components/ui/MediaImage";

export type StageMode = "solo" | "host" | "preview";

interface Props {
  question: Question;
  selected: string[];
  revealed: boolean;
  interactive: boolean;
  onPick: (optionId: string) => void;
  mode: StageMode;
  /** Phone-shaped play: one tile per row, whatever the layout says. */
  narrow?: boolean;
  /** Supplies the tile palette, label colour, and marker style. */
  theme: Theme;
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

export function AnswerGrid({
  question,
  selected,
  revealed,
  interactive,
  onPick,
  mode,
  narrow = false,
  theme,
}: Props) {
  const ageBand = themeAgeBand(theme);
  const correctColor = theme.correctColor ?? DEFAULT_CORRECT_COLOR;
  const wrongColor = theme.wrongColor ?? DEFAULT_WRONG_COLOR;

  // Picture grid: the images themselves, numbered, with none of the
  // markers or coloured tiles the text answers use.
  if (question.kind === "image-choice") {
    const count = question.options.length;
    const gapPx = question.optionGap ?? DEFAULT_IMAGE_GAP;
    const gap = mode === "preview" ? Math.max(2, Math.round(gapPx / 2)) : gapPx;
    const numberText =
      mode === "host" ? "text-xl md:text-2xl" : mode === "solo" ? "text-sm md:text-base" : "text-[8px]";
    const captionText =
      mode === "host" ? "text-sm md:text-base" : mode === "solo" ? "text-xs md:text-sm" : "text-[8px]";

    return (
      <div role="group" aria-label="Images" className="w-full" style={imageChoiceGridStyle(count, gap)}>
        {question.options.map((option, index) => {
          const isPicked = selected.includes(option.id);
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
              className={`focus-ring flex flex-col items-center bg-transparent text-center font-semibold transition-all duration-200 ${
                mode === "preview" ? "" : "animate-tile-in"
              } ${interactive ? "cursor-pointer hover:brightness-110 active:scale-[0.99]" : "cursor-default"} ${
                faded ? "opacity-35 saturate-50" : "opacity-100"
              }`}
              style={{ animationDelay: mode === "preview" ? undefined : `${Math.min(index, 4) * 45}ms` }}
            >
              <span
                className={`relative block aspect-[3/2] w-full overflow-hidden rounded-md bg-white ${
                  isPicked && !revealed ? "ring-4 ring-white/80" : ""
                }`}
                style={{
                  boxShadow: showCorrect
                    ? `0 0 0 4px ${correctColor}, 0 0 28px -6px ${withAlpha(correctColor, 0.9)}`
                    : showWrong
                      ? `0 0 0 4px ${wrongColor}`
                      : undefined,
                }}
              >
                {option.media ? (
                  <MediaImage media={option.media} className="h-full w-full object-contain" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-ink-500">?</span>
                )}
                {revealed && (option.correct || isPicked) && (
                  <span
                    aria-hidden
                    className={`absolute right-1 top-1 rounded-full bg-black/50 px-1.5 leading-none text-white ${
                      mode === "preview" ? "text-[8px]" : "text-sm"
                    }`}
                  >
                    {option.correct ? "✓" : "✕"}
                  </span>
                )}
              </span>
              <span className={`mt-1 ${numberText}`} style={{ color: "var(--prompt-color, #e9ebf4)" }}>
                {index + 1}
              </span>
              {option.text.trim() && (
                <span className={`min-w-0 break-words ${captionText}`} style={{ color: "var(--prompt-color, #e9ebf4)" }}>
                  {option.text}
                </span>
              )}
            </button>
          );
        })}
      </div>
    );
  }

  const columns = narrow || question.layout === "list" ? "grid-cols-1" : "grid-cols-1 sm:grid-cols-2";

  const gap = mode === "preview" ? "gap-1" : "gap-3 md:gap-4";

  return (
    <div className={`grid w-full ${columns} ${gap}`} role={question.kind === "multi-select" ? "group" : undefined}>
      {question.options.map((option, index) => {
        const bg = optionColor(index, { band: ageBand, colors: theme.optionColors, override: option.color });
        const marker = optionMarker(index, { band: ageBand, marker: theme.optionMarker, override: option.icon });
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
            className={`focus-ring relative flex items-center gap-3 overflow-hidden rounded-2xl text-left font-semibold transition-all duration-200 ${
              mode === "preview" ? "" : "animate-tile-in"
            } ${PAD[mode]} ${TEXT[mode]} ${
              interactive ? "cursor-pointer hover:brightness-110 active:scale-[0.99]" : "cursor-default"
            } ${faded ? "opacity-35 saturate-50" : "opacity-100"} ${
              isPicked && !revealed ? "ring-4 ring-white/70" : ""
            } ${showWrong ? "ring-4 ring-white/40" : ""}`}
            style={{
              // Tiles land one after another rather than all at once. Capped so a
              // six-answer question doesn't make the last one feel late.
              animationDelay: mode === "preview" ? undefined : `${Math.min(index, 4) * 45}ms`,
              // The correct tile's white ring and glow ship as one box-shadow:
              // Tailwind's ring is itself a box-shadow, so an inline one would
              // otherwise wipe it out. The glow follows the reveal colour.
              boxShadow: showCorrect
                ? `0 0 0 4px #ffffff, 0 0 40px -6px ${withAlpha(correctColor, 0.9)}`
                : undefined,
              background: showCorrect ? correctColor : showWrong ? wrongColor : bg,
              // Every state picks text that stays readable on whatever colour it
              // landed on — the reveal colours are author-settable now, so
              // hardcoding white here would break on a pale one.
              color: showCorrect
                ? readableTextOn(correctColor)
                : showWrong
                  ? readableTextOn(wrongColor)
                  : (theme.optionTextColor ?? readableTextOn(bg)),
            }}
          >
            {marker && (
              <span aria-hidden className={`shrink-0 opacity-90 ${mode === "preview" ? "text-xs" : "text-2xl"}`}>
                {marker}
              </span>
            )}

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
