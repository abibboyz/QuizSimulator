"use client";

import { answerBoxScale, answerTextStyle, isSingleAnswer, isUnscoredImage } from "@/lib/answerPresentation";
import { fontFamily } from "@/lib/themes";
import type { ElementMotion, LoopMotionSet, Question, Theme } from "@/types/quiz";
import { DEFAULT_CORRECT_COLOR, DEFAULT_WRONG_COLOR, readableTextOn, withAlpha } from "@/lib/themes";
import { optionColor, optionMarker, themeAgeBand } from "@/lib/ageBands";
import {
  DEFAULT_IMAGE_GAP,
  IMAGE_JOINER_MAX_FRACTION,
  imageChoiceColumns,
  imageChoiceGridStyle,
  imageChoiceJoinedGridStyle,
  imageAreaHeight,
  imageAreaWidth,
  imageJoinerGridPlace,
  imageJoinerLabel,
  imageJoinerStyled,
  imageJoinersActive,
  imageJoinerSlots,
  imageTileGridPlace,
} from "@/lib/imageChoice";
import { revealAnswerMedia, resolveReveal } from "@/lib/reveal";
import { LoopMotion } from "@/components/play/LoopMotion";
import { answerLoop, DEFAULT_LOOP } from "@/lib/loopMotion";
import { MediaImage } from "@/components/ui/MediaImage";
import { RevealCaption, RevealPicture } from "@/components/play/RevealPicture";
import { REVEAL_TILE } from "@/lib/revealDraw";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { tileDelayMs } from "@/lib/playTiming";
import { answerPoseAt, isRestPose, type Pose } from "@/lib/stageMotion";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { JoinerCanvas } from "@/components/play/JoinerCanvas";
import { PROMPT_DESIGN_WIDTH, joinerDesignWidth } from "@/lib/promptRenderer";
import { promptFontSize } from "@/lib/promptText";
import { resolveTextStyle } from "@/lib/textStyle";
import { StyledText } from "@/components/play/StyledText";
import { answerChrome, boxlessState, boxlessTextColor, feedbackBarColor, FEEDBACK_BAR, type BoxlessState } from "@/lib/answerChrome";
import { themeInk } from "@/lib/themeInk";

const HIDDEN_REVEAL_TILE = Object.freeze({ fit: "contain" as const, backdrop: "transparent" });

export type StageMode = "solo" | "host" | "preview";

interface Props {
  question: Question;
  loops?: Required<LoopMotionSet>;
  hideImageBoxes?: boolean;
  selected: string[];
  revealed: boolean;
  interactive: boolean;
  onPick: (optionId: string) => void;
  mode: StageMode;
  /** Phone-shaped play: one tile per row, whatever the layout says. */
  narrow?: boolean;
  /** Supplies the tile palette, label colour, and marker style. */
  theme: Theme;
  /** Resolved answer animation. Omitted or all-`default` keeps the CSS tile-in exactly as before. */
  motion?: ElementMotion;
  /** Stage clock (lib/stageMotion inputs): ms since the question mounted / started leaving. */
  sinceMount?: number;
  sinceExit?: number | null;
  onRevealComplete?: () => void;
  /** Builder preview only. Dragging the answer-box dot stores this scale. */
  onAnswerBoxScale?: (scale: number) => void;
  /** Builder preview only. Saves responsive image-area width/height. */
  onImageAreaChange?: (area: NonNullable<Question["imageArea"]>) => void;
}

/**
 * Per-tile animation. `default` entrances stay on the `.animate-tile-in` CSS
 * (so the look is byte-for-byte today's); anything else is an inline pose
 * computed from the stage clock, with CSS transitions switched off while it
 * runs so the pose is exactly f(t) rather than chasing it.
 */
function tileMotion(
  motion: ElementMotion | undefined,
  index: number,
  sinceMount: number,
  sinceExit: number | null,
  faded: boolean,
): { cssTileIn: boolean; style?: { opacity: number; transform: string; transition: string } } {
  if (!motion || (motion.enter === "default" && motion.exit === "default")) return { cssTileIn: true };
  const cssTileIn = motion.enter === "default";
  const pose: Pose = answerPoseAt(cssTileIn ? { ...motion, enter: "none" } : motion, index, sinceMount, sinceExit);
  if (isRestPose(pose)) return { cssTileIn };
  const parts: string[] = [];
  if (pose.rotateX) parts.push("perspective(800px)");
  if (pose.x || pose.y) parts.push(`translate(${pose.x.toFixed(2)}px, ${pose.y.toFixed(2)}px)`);
  if (pose.scale !== 1) parts.push(`scale(${pose.scale.toFixed(4)})`);
  if (pose.rotateX) parts.push(`rotateX(${pose.rotateX.toFixed(2)}deg)`);
  return {
    cssTileIn,
    style: {
      opacity: pose.opacity * (faded ? 0.35 : 1),
      transform: parts.join(" ") || "none",
      transition: "none",
    },
  };
}

const TEXT: Record<StageMode, string> = {
  host: "text-base md:text-lg",
  solo: "text-base md:text-lg",
  preview: "text-[10px]",
};

function captionTextFor(mode: StageMode): string {
  return mode === "preview" ? "text-[8px]" : "text-xs md:text-sm";
}

const BOX_PAD: Record<StageMode, number> = { host: 20, solo: 16, preview: 6 };
const BOX_MIN: Record<StageMode, number> = { host: 96, solo: 80, preview: 32 };
const THUMB: Record<StageMode, number> = { host: 96, solo: 56, preview: 24 };

const PAD: Record<StageMode, string> = {
  host: "p-5 min-h-24",
  solo: "p-4 min-h-20",
  preview: "p-1.5 min-h-8",
};

export function AnswerGrid({
  question,
  loops,
  hideImageBoxes = false,
  selected,
  revealed,
  interactive,
  onPick,
  mode,
  narrow = false,
  theme,
  motion,
  sinceMount = Infinity,
  sinceExit = null,
  onRevealComplete,
  onAnswerBoxScale,
  onImageAreaChange,
}: Props) {
  const reduced = useReducedMotion();
  const ageBand = themeAgeBand(theme);
  const correctColor = theme.correctColor ?? DEFAULT_CORRECT_COLOR;
  const wrongColor = theme.wrongColor ?? DEFAULT_WRONG_COLOR;
  const unscored = isUnscoredImage(question);
  const typography = answerTextStyle(theme, question);
  const boxScale = answerBoxScale(typography);
  const answerSized = boxScale !== 1;
  const scaleFont = boxScale < 0.8 ? Math.max(0.15, boxScale * 1.25) : 1;
  const textStyle = {
    fontFamily: fontFamily(typography.font ?? theme.font, typography.font ? typography.customFont : theme.customFont),
    fontSize: `${((typography.fontSize ?? 18) * scaleFont) / 728 * 100}cqw`,
    fontWeight: typography.bold === undefined ? 600 : typography.bold ? 700 : 400,
    fontStyle: typography.italic ? "italic" : "normal",
    textDecoration: typography.underline ? "underline" : "none",
    lineHeight: boxScale < 0.5 ? 1 : 1.5,
  };
  // Bubbly lettering for answer text and captions (Plain = null keeps the text exactly as before).
  const lettering = useMemo(() => resolveTextStyle(theme.answerTextStyle), [theme.answerTextStyle]);
  // Hide bullets / hide boxes (lib/answerChrome). Both off = the tiles below render exactly as before.
  const chrome = answerChrome(theme);
  const captionStyle = { ...textStyle, fontSize: `${((typography.fontSize ?? 14) * scaleFont) / 728 * 100}cqw`, color: typography.color ?? "var(--prompt-color, #e9ebf4)" };
  const hideCaptionBg = typography.hideImageTextBackground === true;
  const resizeHandle = mode === "preview" && onAnswerBoxScale
    ? <AnswerBoxHandle scale={boxScale} onScale={onAnswerBoxScale} />
    : null;
  const imageWidth = imageAreaWidth(question);
  const imageHeight = imageAreaHeight(question);
  const imageAreaStyle = { width: `${imageWidth * 100}%`, marginInline: "auto", containerType: "inline-size" as const };
  const imageResizeHandles = mode === "preview" && onImageAreaChange
    ? <ImageAreaHandles width={imageWidth} height={imageHeight} onChange={onImageAreaChange} />
    : null;
  const imageCaption = (option: Question["options"][number], index: number) => {
    if (!option.text.trim()) return null;
    const body = lettering ? (
      <StyledText text={option.text} style={lettering} align="center" colorIndex={index} fontSize={captionStyle.fontSize} tint={option.color} className={answerSized ? "w-full" : `mt-1 w-full ${captionTextFor(mode)}`} />
    ) : (
      <span className={answerSized ? "min-w-0 w-full break-words" : `mt-1 min-w-0 break-words ${captionTextFor(mode)}`} style={captionStyle}>{option.text}</span>
    );
    if (!answerSized) return body;
    return (
      <span className="mt-1 block w-full" style={{
        boxSizing: "border-box",
        padding: `${4 * boxScale}px ${8 * boxScale}px`,
        minHeight: `${18 * boxScale}px`,
        borderRadius: 8,
        background: hideCaptionBg ? "transparent" : "rgba(0,0,0,0.55)",
      }}>{body}</span>
    );
  };
  const joinersOn =
    (question.kind === "image-choice" || question.kind === "reveal") &&
    imageJoinersActive(question.options.length, question.imageJoiners);
  const pictureGridRef = useRef<HTMLDivElement>(null);
  const [pictureHeight, setPictureHeight] = useState(0);
  useLayoutEffect(() => {
    if (!joinersOn) return;
    const picture = pictureGridRef.current?.querySelector("[data-choice-picture]");
    if (!(picture instanceof HTMLElement)) return;
    const measure = () => setPictureHeight(picture.getBoundingClientRect().height);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(picture);
    return () => observer.disconnect();
  }, [joinersOn, question.id, question.options.length, question.optionGap, question.imageJoiners, mode]);

  // Reveal uses the same picture grid as image answers. Every tile shows one
  // shared cover (or "?") until the answer is out, and only the correct
  // picture is uncovered then.
  if (question.kind === "reveal") {
    const count = question.options.length;
    const gapPx = question.optionGap ?? DEFAULT_IMAGE_GAP;
    const gap = mode === "preview" ? Math.max(2, Math.round(gapPx / 2)) : gapPx;
    const captionText =
      mode === "preview" ? "text-[8px]" : "text-xs md:text-sm";
    const markText = mode === "host" ? "text-5xl" : mode === "solo" ? "text-3xl" : "text-sm";
    const settings = resolveReveal(question);
    const cover = settings.cover;

    return (
      <div className="w-full">
        <div ref={pictureGridRef} role="group" aria-label="Covered images" className="relative" style={{ ...(joinersOn ? imageChoiceJoinedGridStyle(count, gap) : imageChoiceGridStyle(count, gap)), ...imageAreaStyle }}>
          {question.options.map((option, index) => {
            const isPicked = selected.includes(option.id);
            const showCorrect = revealed && option.correct;
            const showWrong = !unscored && revealed && isPicked && !option.correct;
            const faded = !unscored && revealed && !option.correct && !isPicked;
            const anim = tileMotion(motion, index, sinceMount, sinceExit, faded);
            const tileIn = mode !== "preview" && anim.cssTileIn;
            const answerMedia = revealAnswerMedia(question, option);

            const tile = (
              <LoopMotion key={option.id} value={answerLoop(loops?.answers ?? DEFAULT_LOOP, option)} index={index} preview={mode === "preview"}>
              <button
                key={option.id}
                type="button"
                disabled={!interactive || unscored}
                onClick={() => onPick(option.id)}
                aria-pressed={isPicked}
                className={`w-full h-full focus-ring flex flex-col items-center bg-transparent text-center font-semibold transition-all duration-200 ${
                  tileIn ? "animate-tile-in" : ""
                } ${interactive ? "cursor-pointer hover:brightness-110 active:scale-[0.99]" : "cursor-default"} ${
                  faded ? "opacity-35 saturate-50" : "opacity-100"
                }`}
                style={{ animationDelay: tileIn ? `${tileDelayMs(index)}ms` : undefined, ...anim.style }}
              >
                <span
                  data-choice-picture={joinersOn ? "" : undefined}
                  data-reveal-source={option.correct ? `${question.id}:${option.id}` : undefined}
                  className={`relative block w-full overflow-hidden ${hideImageBoxes ? "bg-transparent" : "rounded-md bg-white"} ${
                    !hideImageBoxes && isPicked && !revealed ? "ring-4 ring-white/80" : ""
                  }`}
                  style={{
                    aspectRatio: `${3 / imageHeight} / 2`,
                    boxShadow: !hideImageBoxes && showCorrect
                      ? `0 0 0 4px ${correctColor}, 0 0 28px -6px ${withAlpha(correctColor, 0.9)}`
                      : !hideImageBoxes && showWrong
                        ? `0 0 0 4px ${wrongColor}`
                        : undefined,
                  }}
                >
                  {cover ? (
                    <MediaImage media={cover} className="h-full w-full object-contain" />
                  ) : (
                    <span className={`grid h-full w-full place-items-center font-bold text-ink-500 ${markText}`}>?</span>
                  )}
                  {/* The uncover draws over the cover it replaces, so the cover stays on
                      screen until the canvas has its pictures and paints its first frame. */}
                  {showCorrect && (
                    <RevealPicture
                      question={{ media: answerMedia, reveal: question.reveal }}
                      theme={theme}
                      revealKey="reveal"
                      maxHeight="100%"
                      instant={reduced}
                      onRevealComplete={onRevealComplete}
                      captionClass={null}
                      fill
                      radius={hideImageBoxes ? 0 : REVEAL_TILE.radius}
                      fit={hideImageBoxes ? HIDDEN_REVEAL_TILE : REVEAL_TILE}
                    />
                  )}
                  {!unscored && revealed && (option.correct || isPicked) && (
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
                {imageCaption(option, index)}
              </button>
            </LoopMotion>
            );
            return placedPicture(joinersOn, index, count, option.id, tile);
          })}
          {joinersOn && (
            <BetweenPictures
              count={count}
              joiners={question.imageJoiners}
              mode={mode}
              family={textStyle.fontFamily}
              fontPx={typography.fontSize ?? 18}
              color={String(captionStyle.color)}
              pictureHeight={pictureHeight}
              gap={gap}
              style={question.imageJoinerStyle}
              theme={theme}
              elapsed={sinceMount}
            />
          )}
          {imageResizeHandles}
        </div>
        <RevealCaption
          settings={settings}
          revealKey={revealed ? `${question.id}:reveal` : null}
          instant={reduced}
          className={`mt-2 text-center font-bold ${captionText}`}
        />
      </div>
    );
  }

  // Picture grid: the images themselves, numbered, with none of the
  // markers or coloured tiles the text answers use.
  if (question.kind === "image-choice") {
    const count = question.options.length;
    const gapPx = question.optionGap ?? DEFAULT_IMAGE_GAP;
    const gap = mode === "preview" ? Math.max(2, Math.round(gapPx / 2)) : gapPx;

    return (
      <div ref={pictureGridRef} role="group" aria-label="Images" className="relative" style={{ ...(joinersOn ? imageChoiceJoinedGridStyle(count, gap) : imageChoiceGridStyle(count, gap)), ...imageAreaStyle }}>
        {question.options.map((option, index) => {
          const isPicked = selected.includes(option.id);
          const showCorrect = revealed && option.correct;
          const showWrong = !unscored && revealed && isPicked && !option.correct;
          const faded = !unscored && revealed && !option.correct && !isPicked;
          const anim = tileMotion(motion, index, sinceMount, sinceExit, faded);
          const tileIn = mode !== "preview" && anim.cssTileIn;

          const tile = (
            <LoopMotion key={option.id} value={answerLoop(loops?.answers ?? DEFAULT_LOOP, option)} index={index} preview={mode === "preview"}>
            <button
              key={option.id}
              type="button"
              disabled={!interactive || unscored}
              onClick={() => onPick(option.id)}
              aria-pressed={isPicked}
              className={`w-full h-full focus-ring flex flex-col items-center bg-transparent text-center font-semibold transition-all duration-200 ${
                tileIn ? "animate-tile-in" : ""
              } ${interactive ? "cursor-pointer hover:brightness-110 active:scale-[0.99]" : "cursor-default"} ${
                faded ? "opacity-35 saturate-50" : "opacity-100"
              }`}
              style={{ animationDelay: tileIn ? `${tileDelayMs(index)}ms` : undefined, ...anim.style }}
            >
              <span
                data-choice-picture={joinersOn ? "" : undefined}
                data-reveal-source={option.correct && option.media ? `${question.id}:${option.id}` : undefined}
                className={`relative block w-full overflow-hidden ${hideImageBoxes ? "bg-transparent" : "rounded-md bg-white"} ${
                  !hideImageBoxes && isPicked && !revealed ? "ring-4 ring-white/80" : ""
                }`}
                style={{
                  aspectRatio: `${3 / imageHeight} / 2`,
                  boxShadow: !hideImageBoxes && showCorrect
                    ? `0 0 0 4px ${correctColor}, 0 0 28px -6px ${withAlpha(correctColor, 0.9)}`
                    : !hideImageBoxes && showWrong
                      ? `0 0 0 4px ${wrongColor}`
                      : undefined,
                }}
              >
                {option.media ? (
                  <MediaImage media={option.media} className="h-full w-full object-contain" />
                ) : (
                  <span className="grid h-full w-full place-items-center text-ink-500">?</span>
                )}
                {!unscored && revealed && (option.correct || isPicked) && (
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
              {imageCaption(option, index)}
            </button>
            </LoopMotion>
          );
          return placedPicture(joinersOn, index, count, option.id, tile);
        })}
        {joinersOn && (
          <BetweenPictures
            count={count}
            joiners={question.imageJoiners}
            mode={mode}
            family={textStyle.fontFamily}
            fontPx={typography.fontSize ?? 18}
            color={String(captionStyle.color)}
            pictureHeight={pictureHeight}
            gap={gap}
            style={question.imageJoinerStyle}
            theme={theme}
            elapsed={sinceMount}
          />
        )}
        {imageResizeHandles}
      </div>
    );
  }

  const denseCount = question.options.length;
  const denseColumns = narrow
    ? denseCount > 8 ? Math.min(2, denseCount) : 1
    : question.layout === "list" || isSingleAnswer(question) ? 1
    : denseCount <= 6 ? 2 : denseCount <= 12 ? 3 : denseCount <= 24 ? 4 : 5;

  const gap = mode === "preview" ? "gap-1" : "gap-3 md:gap-4";

  return (
    <div className={`grid w-full ${gap}${resizeHandle ? " relative" : ""}`} style={{ containerType: "inline-size", gridAutoRows: "1fr", gridTemplateColumns: `repeat(${denseColumns}, minmax(0, 1fr))` }} role={question.kind === "multi-select" ? "group" : undefined}>
      {question.options.map((option, index) => {
        const bg = optionColor(index, { band: ageBand, colors: theme.optionColors, override: option.color });
        const marker = chrome.hideMarkers ? "" : optionMarker(index, { band: ageBand, marker: theme.optionMarker, override: option.icon });
        const isPicked = selected.includes(option.id);
        const isBoxless = chrome.hideBoxes || question.hideAnswerBoxes || option.hideBox;
        const boxless = isBoxless ? boxlessState({ revealed, correct: option.correct, picked: isPicked, unscored }) : null;
        const boxlessBar = boxless && feedbackBarColor(boxless, { correct: correctColor, wrong: wrongColor });

        // Once revealed, the correct answer always lights up — including when
        // nobody picked it, which is the moment the room actually learns something.
        const showCorrect = revealed && option.correct;
        const showWrong = !unscored && revealed && isPicked && !option.correct;
        const faded = !unscored && revealed && !option.correct && !isPicked;
        const anim = tileMotion(motion, index, sinceMount, sinceExit, faded);
        const tileIn = mode !== "preview" && anim.cssTileIn;

        return (
          <LoopMotion key={option.id} value={answerLoop(loops?.answers ?? DEFAULT_LOOP, option)} index={index} preview={mode === "preview"}>
          <button
            key={option.id}
            type="button"
            disabled={!interactive || unscored}
            onClick={() => onPick(option.id)}
            aria-pressed={isPicked}
            data-answer-box={boxless ? "hidden" : undefined}
            className={`w-full h-full focus-ring relative flex items-center ${boxScale < 0.5 ? "gap-1.5" : "gap-3"} overflow-hidden rounded-2xl text-left font-semibold transition-all duration-200 ${
              tileIn ? "animate-tile-in" : ""
            } ${answerSized ? "" : PAD[mode]} ${TEXT[mode]} ${
              interactive ? "cursor-pointer hover:brightness-110 active:scale-[0.99]" : "cursor-default"
            } ${faded ? "opacity-35 saturate-50" : "opacity-100"} ${
              !boxless && isPicked && !revealed ? "ring-4 ring-white/70" : ""
            } ${!boxless && showWrong ? "ring-4 ring-white/40" : ""}`}
            style={{
              // Tiles land one after another rather than all at once. Capped so a
              // six-answer question doesn't make the last one feel late.
              animationDelay: tileIn ? `${tileDelayMs(index)}ms` : undefined,
              // The correct tile's white ring and glow ship as one box-shadow:
              // Tailwind's ring is itself a box-shadow, so an inline one would
              // otherwise wipe it out. The glow follows the reveal colour.
              boxShadow: boxless ? undefined : showCorrect
                ? `0 0 0 4px #ffffff, 0 0 40px -6px ${withAlpha(correctColor, 0.9)}`
                : undefined,
              background: boxless ? "transparent" : showCorrect ? correctColor : showWrong ? wrongColor : bg,
              // Every state picks text that stays readable on whatever colour it
              // landed on — the reveal colours are author-settable now, so
              // hardcoding white here would break on a pale one.
              color: boxless
                ? boxlessTextColor(boxless, { rest: option.color ?? typography.color ?? themeInk(theme)[100], correct: correctColor, wrong: wrongColor })
                : showCorrect
                ? readableTextOn(correctColor)
                : showWrong
                  ? readableTextOn(wrongColor)
                  : (typography.color ?? readableTextOn(bg)),
              maxWidth: option.boxWidth ? `${Math.round(option.boxWidth * 100)}%` : undefined,
              width: "100%",
              margin: option.boxWidth ? "0 auto" : undefined,
              ...(answerSized
                ? {
                    padding: `${Math.max(1, Math.round(BOX_PAD[mode] * boxScale))}px ${Math.max(2, Math.round(16 * boxScale))}px`,
                    minHeight: `${Math.max(2, Math.round(BOX_MIN[mode] * boxScale))}px`,
                  }
                : null),
              ...textStyle,
              ...anim.style,
            }}
          >
            {marker && (
              <span aria-hidden className={`shrink-0 opacity-90 ${mode === "preview" ? "text-xs" : "text-2xl"}`}>
                {marker}
              </span>
            )}

            {option.media && (
              <span
                data-reveal-source={option.correct ? `${question.id}:${option.id}` : undefined}
                className="block shrink-0"
              >
                <MediaImage
                  media={option.media}
                  className={`${hideImageBoxes ? "" : "rounded-lg"} object-cover ${
                    answerSized ? "" : mode === "host" ? "h-24 w-24" : mode === "solo" ? "h-14 w-14" : "h-6 w-6"
                  }`}
                  style={answerSized ? { width: Math.max(4, Math.round(THUMB[mode] * boxScale)), height: Math.max(4, Math.round(THUMB[mode] * boxScale)), maxHeight: "100%" } : undefined}
                />
              </span>
            )}

            {lettering ? (
              <StyledText text={option.text} style={lettering} colorIndex={index} tint={boxless ? option.color : undefined} className="flex-1" />
            ) : (
              <span className="min-w-0 flex-1 break-words">{option.text}</span>
            )}

            {!unscored && revealed && (option.correct || isPicked) && (
              <span aria-hidden className={mode === "preview" ? "text-xs" : "text-2xl"}>
                {option.correct ? "✓" : "✕"}
              </span>
            )}
            {boxless && <FeedbackBar state={boxless} color={boxlessBar} />}
          </button>
            </LoopMotion>
        );
      })}
      {resizeHandle}
    </div>
  );
}

function placedPicture(active: boolean, index: number, count: number, optionId: string, tile: ReactNode) {
  if (!active) return tile;
  const place = imageTileGridPlace(index, imageChoiceColumns(count));
  return (
    <div key={optionId} className="relative z-[1] min-w-0" style={{ gridColumn: place.gridColumn, gridRow: place.gridRow }}>
      {tile}
    </div>
  );
}

/** A word centred on the picture band of one horizontal gap. */
function BetweenPictures({
  count,
  joiners,
  mode,
  family,
  fontPx,
  color,
  pictureHeight,
  gap,
  style,
  theme,
  elapsed,
}: {
  count: number;
  joiners?: string[];
  mode: StageMode;
  family: string;
  fontPx: number;
  color: string;
  pictureHeight: number;
  gap: number;
  style?: Question["promptStyle"];
  theme: Theme;
  elapsed: number;
}) {
  const columns = imageChoiceColumns(count);
  const styled = imageJoinerStyled(style);
  return (
    <>
      {imageJoinerSlots(count).map((index) => {
        const text = imageJoinerLabel(joiners, index);
        if (!text) return null;
        const place = imageJoinerGridPlace(index, columns);
        const designSize = promptFontSize(style, 30);
        const designWidth = styled ? joinerDesignWidth(text, style) : 0;
        const cssWidth = mode === "preview"
          ? `${Math.max(8, designWidth * (10 / designSize))}px`
          : `${(designWidth / PROMPT_DESIGN_WIDTH) * 100}cqw`;
        return (
          <div
            key={`between-${index}`}
            style={{
              gridColumn: place.gridColumn,
              gridRow: place.gridRow,
              alignSelf: "start",
              height: pictureHeight > 0 ? pictureHeight : undefined,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              position: "relative",
              zIndex: 4,
              minWidth: 0,
              boxSizing: "content-box",
              padding: `0 ${gap}px`,
            }}
          >
            {styled && style ? (
              <JoinerCanvas text={text} style={style} theme={theme} cssWidth={cssWidth} elapsed={elapsed} />
            ) : (
              <span
                style={{
                  fontFamily: family,
                  fontWeight: 800,
                  fontSize: mode === "preview" ? "10px" : `${(fontPx / 728) * 100}cqw`,
                  color,
                  lineHeight: 1.1,
                  textAlign: "center",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  maxWidth: `${(IMAGE_JOINER_MAX_FRACTION * 100) / columns}cqw`,
                }}
              >
                {text}
              </span>
            )}
          </div>
        );
      })}
    </>
  );
}

/** Drag the corner of the answer area in the builder preview. A click that does not move leaves the size alone. */
function AnswerBoxHandle({ scale, onScale }: { scale: number; onScale: (scale: number) => void }) {
  const drag = useRef<{ y: number; scale: number } | null>(null);
  return (
    <button
      type="button"
      aria-label="Resize answer text boxes"
      title="Drag to resize the answer text boxes on this question"
      className="absolute -bottom-1 -right-1 z-30 h-3.5 w-3.5 cursor-ns-resize rounded-full border-2 border-white bg-[var(--accent)] shadow"
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { y: event.clientY, scale };
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        const next = drag.current.scale + (event.clientY - drag.current.y) / 72;
        onScale(Math.min(2.5, Math.max(0.5, Math.round(next * 20) / 20)));
      }}
      onPointerUp={() => { drag.current = null; }}
      onPointerCancel={() => { drag.current = null; }}
    />
  );
}

function ImageAreaHandles({ width, height, onChange }: { width: number; height: number; onChange: (area: NonNullable<Question["imageArea"]>) => void }) {
  const drag = useRef<{ axis: "x" | "y"; start: number; width: number; height: number } | null>(null);
  const handle = (axis: "x" | "y", className: string, label: string) => (
    <button type="button" aria-label={label} title={label}
      className={`absolute z-30 h-4 w-4 touch-none rounded-full border-2 border-white bg-[var(--accent)] shadow ${className}`}
      onPointerDown={(event) => {
        event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { axis, start: axis === "x" ? event.clientX : event.clientY, width, height };
      }}
      onPointerMove={(event) => {
        const current = drag.current; if (!current || current.axis !== axis) return;
        const delta = (axis === "x" ? event.clientX : event.clientY) - current.start;
        const nextWidth = axis === "x" ? Math.min(1, Math.max(0.35, current.width + delta / 220)) : current.width;
        const nextHeight = axis === "y" ? Math.min(2.5, Math.max(0.5, current.height + delta / 80)) : current.height;
        onChange({ width: Math.round(nextWidth * 20) / 20, height: Math.round(nextHeight * 20) / 20 });
      }}
      onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
  );
  return <>{handle("x", "-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize", "Drag horizontally to resize image area")}{handle("y", "-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize", "Drag vertically to resize image area")}</>;
}

/** Hide answer boxes: the bar that carries picked / correct (glowing) / wrong once there's no card colour. */
function FeedbackBar({ state, color }: { state: BoxlessState; color: string | null }) {
  return (
    <span
      aria-hidden
      data-feedback-bar={state}
      className="pointer-events-none absolute rounded-full transition-all duration-200"
      style={{
        left: FEEDBACK_BAR.inset,
        right: FEEDBACK_BAR.inset,
        bottom: FEEDBACK_BAR.bottom,
        height: FEEDBACK_BAR.height,
        background: color ?? "transparent",
        boxShadow: state === "correct" && color ? `0 0 ${FEEDBACK_BAR.glow}px ${color}` : undefined,
        opacity: color ? 1 : 0,
      }}
    />
  );
}
