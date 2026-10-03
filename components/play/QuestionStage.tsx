"use client";

import { Fragment, useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";
import { usePresence } from "motion/react";
import type { Question, QuizSettings, Theme } from "@/types/quiz";
import { LoopMotion } from "@/components/play/LoopMotion";
import { resolveLoops } from "@/lib/loopMotion";
import { fontFamily, withAlpha } from "@/lib/themes";
import { promptAnimationElapsed, promptAnimationSpan, promptParagraphLines, promptPathPose, promptSegmentPose, promptSegmentProgress, promptSegments } from "@/lib/promptDesign";
import { promptPosition } from "@/lib/questionPresentation";
import {
  promptAlign,
  promptFontSize,
  promptFontStack,
  promptGraphemes,
  promptPreservesBreaks,
  wordArtCss,
  wordArtInk,
  wordArtStyleOf,
} from "@/lib/promptText";
import { MediaImage } from "@/components/ui/MediaImage";
import { useMediaUrl } from "@/hooks/useMediaUrl";
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
  loopSettings?: Pick<QuizSettings, "loopMotion">;
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
}

const PROMPT_TEXT: Record<StageMode, string> = {
  host: "text-4xl md:text-6xl leading-tight",
  solo: "text-lg md:text-2xl leading-snug",
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
}: Props) {
  const loops = resolveLoops(loopSettings, question);
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
  const typed = typing ? typewriterChars(prompt, motion.question, sinceMount) : 0;
  const promptChars = typing ? promptGraphemes(prompt) : [];
  const textElapsed = useElapsedSince(textAnimation ? `${question.id}-${promptReplay}-${prompt}-${JSON.stringify(textAnimation)}` : null,
    textAnimation ? promptAnimationSpan(prompt, textAnimation) * (textAnimation.repeat === null ? Infinity : Math.max(1, textAnimation.repeat ?? 1)) : 0, reduced) ?? Infinity;
  const textPhase = textAnimation ? promptAnimationElapsed(prompt, textAnimation, textElapsed) : Infinity;
  const align = promptAlign(question.promptStyle);
  const aligned = align !== "center";
  const sizeBase = overlay && mode === "host" ? 24 : mode === "host" ? 60 : mode === "preview" ? 11 : 30;
  const promptPx = promptFontSize(question.promptStyle, sizeBase);
  const artStyle = wordArtStyleOf(question.promptStyle?.wordArt);
  const art = artStyle ? wordArtInk(theme.accent, theme.surface, artStyle) : null;
  const chosenFont = question.promptStyle?.font
    ? fontFamily(question.promptStyle.font, question.promptStyle.customFont)
    : undefined;
  const box = question.promptStyle?.box;
  const boxImageUrl = useMediaUrl(box?.image);
  const boxFill = withAlpha(box?.fill ?? theme.surface, box?.opacity ?? 0.85);
  const boxBackground = box?.backgroundStyle === "gradient"
    ? `linear-gradient(${box.gradientAngle ?? 135}deg, ${boxFill}, ${withAlpha(box.gradientTo ?? theme.accent, box.opacity ?? 0.85)})`
    : box?.backgroundStyle === "texture"
      ? `repeating-linear-gradient(135deg, ${withAlpha("#ffffff", 0.06)} 0px, ${withAlpha("#ffffff", 0.06)} 2px, transparent 2px, transparent 7px), linear-gradient(${boxFill}, ${boxFill})`
      : box?.backgroundStyle === "image" && boxImageUrl
        ? `linear-gradient(${boxFill}, ${boxFill}), url("${boxImageUrl}")`
        : undefined;
  const shape = question.promptStyle?.textShape ?? "straight";
  const boxPadding = mode === "preview" ? (box?.padding ?? 16) * 0.35 : box?.padding ?? 16;
  const boxStyle: CSSProperties | undefined = box && box.shape !== "none" ? {
    backgroundColor: boxFill,
    backgroundImage: boxBackground,
    backgroundSize: "cover",
    backgroundPosition: "center",
    border: `${box.borderWidth ?? 2}px ${box.borderStyle ?? "solid"} ${box.border ?? withAlpha(theme.accent, 0.7)}`,
    borderRadius: box.shape === "pill" || box.shape === "circle" ? 999 : box.shape === "card" ? 16 : box.shape === "rectangle" ? 0 : 8,
    clipPath: box.shape === "banner" ? "polygon(5% 0, 95% 0, 100% 50%, 95% 100%, 5% 100%, 0 50%)" : undefined,
    boxShadow: box.shadow ? `0 12px 30px ${withAlpha("#000000", 0.35)}` : undefined,
    padding: boxPadding,
    minWidth: box.shape === "circle" ? promptPx * 3 : undefined,
    minHeight: box.shape === "circle" ? promptPx * 3 : undefined,
    aspectRatio: box.shape === "circle" ? "1" : undefined,
    display: box.shape === "circle" ? "grid" : undefined,
    placeItems: box.shape === "circle" ? "center" : undefined,
    maxWidth: "100%",
    position: "relative",
  } : undefined;
  const finish = question.promptStyle?.fillEffect ?? "solid";
  const fillStyle: CSSProperties = finish === "solid" ? {} : {
    backgroundImage: finish === "gradient" ? `linear-gradient(110deg, ${theme.accent}, #ffffff, ${theme.accent})`
      : finish === "metallic" ? "linear-gradient(#fff7c2 0%, #eab308 45%, #78350f 53%, #fef08a 100%)"
      : "repeating-linear-gradient(112deg, #ffffff 0px, #ffffff 2px, #cbd5e1 3px, #ffffff 5px)",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  };
  // Host mode packs tighter: everything has to clear a 720p projector without
  // pushing the answer tiles under the control bar.
  const gap = mode === "preview" ? "gap-1.5" : mode === "host" ? "gap-3 md:gap-5" : "gap-6 md:gap-8";

  const promptNode = (
    <LoopMotion value={loops.question} preview={mode === "preview"}>
  <h2
    className={`stage-prompt font-bold ${aligned ? "w-full" : "text-center"} ${overlay && mode === "host" ? "text-lg md:text-2xl leading-snug" : PROMPT_TEXT[mode]}`}
    style={{
      color: art ? art.fill : "var(--prompt-color)",
      fontWeight: question.promptStyle?.bold === false ? 400 : 700,
      fontStyle: question.promptStyle?.italic ? "italic" : "normal",
      textDecoration: question.promptStyle?.underline ? "underline" : "none",
      fontFamily: promptFontStack(chosenFont ?? "var(--quiz-font)"),
      textAlign: aligned ? align : undefined,
      whiteSpace: promptPreservesBreaks(prompt) ? "pre-wrap" : undefined,
      fontSize: promptPx,
      lineHeight: 1.375,
      letterSpacing: question.promptStyle?.letterSpacing ? `${question.promptStyle.letterSpacing}px` : undefined,
      ...(question.promptStyle?.lineSpacing ? { lineHeight: question.promptStyle.lineSpacing } : {}),
      textShadow: art ? wordArtCss(art, promptPx) : undefined,
      ...boxStyle,
    }}
    aria-label={typing ? prompt : undefined}
  >
    {shape !== "straight" && prompt ? (
      <CurvedPrompt text={prompt} shape={shape} curve={question.promptStyle?.curve ?? 50} size={promptPx}
        animation={textAnimation} elapsed={textPhase} finish={finish} accent={theme.accent} />
    ) : question.promptStyle?.paragraphShape && question.promptStyle.paragraphShape !== "normal" && prompt ? (
      <span style={fillStyle}><ParagraphPrompt text={prompt} shape={question.promptStyle.paragraphShape} size={promptPx} mode={mode} animation={textAnimation} elapsed={textPhase} /></span>
    ) : typing ? (
      <span style={fillStyle}>
        {promptChars.slice(0, typed).join("")}
        {/* The untyped rest is laid out but invisible, so lines don't reflow as it types. */}
        <span aria-hidden style={{ visibility: "hidden" }}>
          {promptChars.slice(typed).join("")}
        </span>
      </span>
    ) : textAnimation && prompt ? (
      <span aria-label={prompt} style={{ whiteSpace: "pre-wrap", ...fillStyle }}>
        {promptSegments(prompt, textAnimation.unit).map((segment, index) => {
          const pose = promptSegmentPose(textAnimation.effect, promptSegmentProgress(textAnimation, index, textPhase), promptPx);
          return <Fragment key={index}>{segment.text.split(/(\r?\n)/u).map((part, partIndex) =>
            part.includes("\n") ? <br key={partIndex} aria-hidden />
              : <span key={partIndex} aria-hidden style={{ display: "inline-block", whiteSpace: "pre-wrap", opacity: pose.opacity, transform: `translate(${pose.x}px, ${pose.y}px) scale(${pose.scale}) rotateX(${pose.rotateX}deg)` }}>{part}</span>
          )}</Fragment>;
        })}
      </span>
    ) : <span style={fillStyle}>{question.prompt || <span className="text-ink-500">Untitled question</span>}</span>}
    {box?.shape === "speech" && <span aria-hidden style={{ position: "absolute", bottom: -7, left: "25%", width: 12, height: 12, transform: "rotate(45deg)", background: boxFill, borderRight: `${box.borderWidth ?? 2}px ${box.borderStyle ?? "solid"} ${box.border ?? withAlpha(theme.accent, 0.7)}`, borderBottom: `${box.borderWidth ?? 2}px ${box.borderStyle ?? "solid"} ${box.border ?? withAlpha(theme.accent, 0.7)}` }} />}
  </h2>
    </LoopMotion>
  );

  return (
    <div className={`flex w-full flex-col ${gap}`}>
      <div className="flex items-start justify-between gap-4">
        <span className={`font-semibold uppercase tracking-widest text-ink-300 ${META_TEXT[mode]}`}>
          Question {index + 1} of {total}
          {question.kind === "multi-select" && <span className="ml-2 text-ink-400">· pick all that apply</span>}
          {question.kind === "image-choice" && <span className="ml-2 text-ink-400">· pick an image</span>}
          {question.kind === "reveal" && <span className="ml-2 text-ink-400">· pick a cover</span>}
        </span>
        {header}
      </div>

      {imageLeads && !overlay && (
        <div className={aligned ? `flex w-full ${align === "right" ? "justify-end" : "justify-start"}` : "flex justify-center"} style={questionStyle}>
          <LoopMotion value={loops.question} preview={mode === "preview"}>
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
          </div>
          </LoopMotion>
        )}
      </div>}

      {overlay && (
        <div ref={canvasRef} className="relative mx-auto w-full overflow-hidden rounded-xl" style={{ maxWidth: mode === "host" ? "40vh" : undefined, aspectRatio: "16 / 9" }}>
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

function ParagraphPrompt({ text, shape, size, mode, animation, elapsed }: {
  text: string;
  shape: "narrow" | "wide" | "diamond" | "oval";
  size: number;
  mode: StageMode;
  animation?: NonNullable<NonNullable<Question["promptStyle"]>["textAnimation"]>;
  elapsed: number;
}) {
  const width = mode === "preview" ? 300 : mode === "host" ? 800 : 380;
  const lines = promptParagraphLines(text, shape, width / Math.max(1, size * 0.6));
  const segments = animation ? promptSegments(text, animation.unit) : [];
  return <span role="text" aria-label={text} style={{ display: "block", textAlign: "center", width: "100%" }}>
    {lines.map((line, lineIndex) => <span key={lineIndex} aria-hidden style={{ display: "block", whiteSpace: "pre" }}>
      {!animation ? line.text : segments.flatMap((segment, index) => {
        const from = Math.max(line.start, segment.start);
        const to = Math.min(line.end, segment.end);
        if (to <= from) return [];
        const part = promptGraphemes(line.text).slice(from - line.start, to - line.start).join("");
        const pose = promptSegmentPose(animation.effect, promptSegmentProgress(animation, index, elapsed), size);
        return <span key={index} style={{ display: "inline-block", opacity: pose.opacity, transform: `translate(${pose.x}px, ${pose.y}px) scale(${pose.scale}) rotateX(${pose.rotateX}deg)` }}>{part}</span>;
      })}
    </span>)}
  </span>;
}

function CurvedPrompt({ text, shape, curve, size, animation, elapsed, finish, accent }: {
  text: string;
  shape: "arc-up" | "arc-down" | "circle" | "wave" | "s-curve" | "zigzag" | "spiral";
  curve: number;
  size: number;
  animation?: NonNullable<NonNullable<Question["promptStyle"]>["textAnimation"]>;
  elapsed: number;
  finish: "solid" | "gradient" | "metallic" | "chalk";
  accent: string;
}) {
  const id = useId().replaceAll(":", "");
  const glyphs = promptGraphemes(text.replaceAll("\n", " "));
  const width = Math.max(size * 3, glyphs.length * size * 0.7);
  const radius = Math.max(size, width / (2 * Math.PI));
  const height = shape === "circle" ? 2 * radius + size : size * 4;
  const segments = animation ? promptSegments(text, animation.unit) : [];
  const pathId = `${id}-path`;
  const path = Array.from({ length: 65 }, (_, index) => {
    const point = promptPathPose(shape, index / 64, width - size, size, curve);
    return `${index ? "L" : "M"}${(point.x + size / 2).toFixed(2)} ${(point.y + (shape === "circle" ? size / 2 : height / 2)).toFixed(2)}`;
  }).join(" ");
  return <svg role="img" aria-label={text} viewBox={`0 0 ${width} ${height}`} style={{ display: "block", width: "100%", maxWidth: width, height: "auto", overflow: "visible" }}>
    <defs>
      <path id={pathId} d={path} />
      <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
        {finish === "metallic" ? <><stop stopColor="#fff7c2" /><stop offset="0.45" stopColor="#eab308" /><stop offset="0.53" stopColor="#78350f" /><stop offset="1" stopColor="#fef08a" /></>
          : finish === "chalk" ? <><stop stopColor="#ffffff" /><stop offset="0.5" stopColor="#cbd5e1" /><stop offset="1" stopColor="#ffffff" /></>
          : <><stop stopColor={accent} /><stop offset="0.5" stopColor="#ffffff" /><stop offset="1" stopColor={accent} /></>}
      </linearGradient>
    </defs>
    <text aria-hidden="true" fontSize={size} fill={finish === "solid" ? "currentColor" : `url(#${id})`}>
      <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle">
        {!animation ? text.replaceAll("\n", " ") : segments.map((segment, index) => {
          const pose = promptSegmentPose(animation.effect, promptSegmentProgress(animation, index, elapsed), size);
          return <tspan key={index} opacity={pose.opacity} style={{ transform: `translate(${pose.x}px, ${pose.y}px) scale(${pose.scale}) rotateX(${pose.rotateX}deg)`, transformBox: "fill-box", transformOrigin: "center" }}>{segment.text.replaceAll("\n", " ")}</tspan>;
        })}
      </textPath>
    </text>
  </svg>;
}
