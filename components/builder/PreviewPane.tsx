"use client";

import { isUnscoredImage } from "@/lib/answerPresentation";
import { questionTheme } from "@/lib/questionPresentation";
import { useState } from "react";
import type { Question, Quiz } from "@/types/quiz";
import { getPreset, themeVars } from "@/lib/themes";
import { showsProgressBar } from "@/lib/progress";
import { hidesImageBoxes } from "@/lib/imageChoice";
import { AnimatedBackground } from "@/components/bg/AnimatedBackground";
import { QuestionStage } from "@/components/play/QuestionStage";
import { CelebrationCard } from "@/components/play/CelebrationCard";
import { FramedPreview } from "@/components/builder/FramedPreview";
import { DEFAULT_PREVIEW_FRAME, framingFor, PREVIEW_FRAMES, type PreviewFrame } from "@/lib/previewFrame";

interface Props {
  quiz: Quiz;
  question: Question;
  index: number;
  onChange: (question: Question) => void;
  /** Builder (default, the original editable preview), or Web 16:9 / Mobile 9:16 as it plays and exports. */
  frame?: PreviewFrame;
  onFrameChange?: (frame: PreviewFrame) => void;
}

/**
 * Renders the real QuestionStage at preview scale, so what you see here is
 * exactly what plays — including the theme and background you picked.
 */
export function PreviewPane({ quiz, question, index, onChange, frame = DEFAULT_PREVIEW_FRAME, onFrameChange }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [promptReplay, setPromptReplay] = useState(0);
  const [completedRevealQuestion, setCompletedRevealQuestion] = useState<string | null>(null);
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
    return (
      <div className="space-y-2">
        <span className="block text-xs font-semibold uppercase tracking-widest text-ink-400">Live preview</span>
        {frameSwitch}
        <FramedPreview quiz={quiz} index={index} framing={framing} />
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
          />
        </div>
        {revealed && !isUnscoredImage(question) && (question.kind !== "reveal" || completedRevealQuestion === question.id) && (
          <CelebrationCard question={question} mode="preview" hideImageBoxes={hidesImageBoxes(quiz.settings, question)} />
        )}
      </div>
    </div>
  );
}
