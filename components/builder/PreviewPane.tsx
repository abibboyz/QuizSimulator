"use client";

import { isUnscoredImage } from "@/lib/answerPresentation";
import { questionTheme } from "@/lib/questionPresentation";
import { useState } from "react";
import type { Question, Quiz, QuizSettings } from "@/types/quiz";
import { timerPlacementFor, withTimerPlacement } from "@/lib/timerPlacement";
import { getPreset, themeVars } from "@/lib/themes";
import { showsProgressBar } from "@/lib/progress";
import { hidesImageBoxes } from "@/lib/imageChoice";
import { withAnswerBoxScale } from "@/lib/answerPresentation";
import { AnimatedBackground } from "@/components/bg/AnimatedBackground";
import { QuestionStage } from "@/components/play/QuestionStage";
import { CelebrationCard } from "@/components/play/CelebrationCard";
import { FramedPreview } from "@/components/builder/FramedPreview";
import { DEFAULT_PREVIEW_FRAME, framingFor, PREVIEW_FRAMES, type PreviewFrame } from "@/lib/previewFrame";
import { withStagePlacement } from "@/lib/stageLayout";

interface Props {
  quiz: Quiz;
  question: Question;
  index: number;
  onChange: (question: Question) => void;
  /** Builder (default, the original editable preview), or Web 16:9 / Mobile 9:16 as it plays and exports. */
  frame?: PreviewFrame;
  onFrameChange?: (frame: PreviewFrame) => void;
  onChangeSettings?: (patch: Partial<QuizSettings>) => void;
}

/**
 * Renders the real QuestionStage at preview scale, so what you see here is
 * exactly what plays — including the theme and background you picked.
 */
export function PreviewPane({ quiz, question, index, onChange, frame = DEFAULT_PREVIEW_FRAME, onFrameChange, onChangeSettings }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [promptReplay, setPromptReplay] = useState(0);
  const [completedRevealQuestion, setCompletedRevealQuestion] = useState<string | null>(null);
  const [layoutEditing, setLayoutEditing] = useState(true);
  const [layoutScope, setLayoutScope] = useState<"all" | "question">("all");
  const theme = questionTheme(quiz.theme, question);
  const preset = getPreset(theme.preset);
  const framing = framingFor(frame);

  const frameSwitch = onFrameChange && (
    <div role="radiogroup" aria-label="Preview framing" className="flex gap-0.5 rounded-xl border border-ink-700 bg-ink-900/60 p-0.5">
      {PREVIEW_FRAMES.map((option) => (
        <button
          key={option.id}
          type="button"
          role="radio"
          aria-checked={frame === option.id}
          title={option.hint}
          onClick={() => onFrameChange(option.id)}
          className={`focus-ring flex-1 rounded-lg px-2 py-1 text-xs font-semibold transition ${
            frame === option.id ? "text-ink-950" : "text-ink-400 hover:text-ink-200"
          }`}
          style={frame === option.id ? { background: "var(--accent)" } : undefined}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  if (framing) {
    const view = framing === "vertical" ? "mobile" : "web";
    const timerOwner = layoutScope === "all" ? quiz.settings : question;
    const placed = timerPlacementFor(timerOwner, view);
    const saveTimer = (point: Parameters<typeof withTimerPlacement>[2]) => {
      const timerPlacement = withTimerPlacement(timerOwner.timerPlacement, view, point);
      if (layoutScope === "all") onChangeSettings?.({ timerPlacement });
      else onChange({ ...question, timerPlacement });
    };
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="block text-xs font-semibold uppercase tracking-widest text-ink-400">Live preview</span>
          {placed && (
            <button
              type="button"
              onClick={() => saveTimer(null)}
              className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800"
            >
              {layoutScope === "question" ? "Use quiz timer position" : "Reset timer"}
            </button>
          )}
        </div>
        {frameSwitch}
        <div className="flex flex-wrap items-center gap-1 rounded-xl border border-ink-700 bg-ink-900/60 p-1 text-xs">
          <button type="button" aria-pressed={layoutEditing} onClick={() => setLayoutEditing((value) => !value)}
            className={`focus-ring rounded-lg px-2 py-1 font-semibold ${layoutEditing ? "bg-[var(--accent)] text-ink-950" : "text-ink-300"}`}>
            Edit layout {layoutEditing ? "on" : "off"}
          </button>
          {(["all", "question"] as const).map((scope) => <button key={scope} type="button" aria-pressed={layoutScope === scope} onClick={() => setLayoutScope(scope)}
            className={`focus-ring rounded-lg px-2 py-1 font-semibold ${layoutScope === scope ? "bg-ink-700 text-white" : "text-ink-400"}`}>
            {scope === "all" ? "All questions" : "This question"}
          </button>)}
          <button type="button" className="focus-ring ml-auto rounded-lg px-2 py-1 font-semibold text-ink-400 hover:text-white" onClick={() => {
            if (layoutScope === "all") {
              const withoutQuestion = withStagePlacement(quiz.settings.stageLayout, view, "question", null);
              onChangeSettings?.({ stageLayout: withStagePlacement(withoutQuestion, view, "answers", null), timerPlacement: withTimerPlacement(quiz.settings.timerPlacement, view, null) });
            } else {
              const withoutQuestion = withStagePlacement(question.stageLayout, view, "question", null);
              onChange({ ...question, stageLayout: withStagePlacement(withoutQuestion, view, "answers", null), timerPlacement: withTimerPlacement(question.timerPlacement, view, null) });
            }
          }}>Reset layout</button>
        </div>
        <FramedPreview
          quiz={quiz}
          index={index}
          framing={framing}
          onTimerPlace={saveTimer}
          layoutEditing={layoutEditing}
          onStagePlace={(item, point) => {
            if (layoutScope === "all") onChangeSettings?.({ stageLayout: withStagePlacement(quiz.settings.stageLayout, view, item, point) });
            else onChange({ ...question, stageLayout: withStagePlacement(question.stageLayout, view, item, point) });
          }}
        />
        <p className="text-[11px] text-ink-500">The selected scope applies to question, answer, and timer positions and sizes. Web and Mobile are saved separately. Reset clears this view’s layout for the selected scope; question overrides return to the quiz defaults.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-400">Live preview</span>
        <div className="flex items-center gap-2">
        {question.promptStyle?.textAnimation && <button type="button" onClick={() => setPromptReplay((value) => value + 1)}
          className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800">Replay prompt</button>}
        {!isUnscoredImage(question) && <button
          type="button"
          onClick={() => {
            setCompletedRevealQuestion(null);
            setRevealed((value) => !value);
          }}
          className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800"
        >
          {revealed ? "Hide answer" : "Show answer"}
        </button>}
        </div>
      </div>
      {frameSwitch}

      <div
        className="relative overflow-hidden rounded-2xl border border-ink-700"
        style={{ ...themeVars(theme), background: theme.surface }}
      >
        <AnimatedBackground
          kind={theme.bgAnimation}
          accent={theme.accent}
          glow={preset.glow}
          surface={theme.surface}
          contained
          image={theme.bgImage}
          imageFit={theme.bgImageFit}
          imageDim={theme.bgImageDim}
        />
        <div className="relative p-4">
          <QuestionStage
                loopSettings={quiz.settings}
            question={question}
            index={index}
            total={quiz.questions.length}
            selected={[]}
            revealed={revealed}
            onRevealComplete={() => setCompletedRevealQuestion(question.id)}
            interactive={false}
            onPick={() => {}}
            mode="preview"
            showCount={showsProgressBar(quiz.settings)}
            promptReplay={promptReplay}
            theme={theme}
            onPositionChange={(promptPlacement) => onChange({ ...question, promptPlacement })}
            onAnswerBoxScale={(scale) => {
              const answerStyle = withAnswerBoxScale(question.answerStyle, scale);
              if (answerStyle?.boxScale === question.answerStyle?.boxScale) return;
              if (!answerStyle) {
                const { answerStyle: _drop, ...rest } = question;
                onChange(rest);
                return;
              }
              onChange({ ...question, answerStyle });
            }}
            onImageAreaChange={(imageArea) => onChange({ ...question, imageArea })}
            onPromptAreaChange={(promptArea) => onChange({ ...question, promptArea })}
          />
        </div>
        {revealed && !isUnscoredImage(question) && (question.kind !== "reveal" || completedRevealQuestion === question.id) && (
          <CelebrationCard question={question} mode="preview" hideImageBoxes={hidesImageBoxes(quiz.settings, question)} />
        )}
      </div>
    </div>
  );
}
