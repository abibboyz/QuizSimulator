"use client";

import { useState } from "react";
import type { Question, Quiz } from "@/types/quiz";
import { getPreset, themeVars } from "@/lib/themes";
import { AnimatedBackground } from "@/components/bg/AnimatedBackground";
import { QuestionStage } from "@/components/play/QuestionStage";

interface Props {
  quiz: Quiz;
  question: Question;
  index: number;
}

/**
 * Renders the real QuestionStage at preview scale, so what you see here is
 * exactly what plays — including the theme and background you picked.
 */
export function PreviewPane({ quiz, question, index }: Props) {
  const [revealed, setRevealed] = useState(false);
  const preset = getPreset(quiz.theme.preset);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-400">Live preview</span>
        <button
          type="button"
          onClick={() => setRevealed((value) => !value)}
          className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800"
        >
          {revealed ? "Hide answer" : "Show answer"}
        </button>
      </div>

      <div
        className="relative overflow-hidden rounded-2xl border border-ink-700"
        style={{ ...themeVars(quiz.theme), background: quiz.theme.surface }}
      >
        <AnimatedBackground
          kind={quiz.theme.bgAnimation}
          accent={quiz.theme.accent}
          glow={preset.glow}
          surface={quiz.theme.surface}
          contained
        />
        <div className="relative p-4">
          <QuestionStage
            question={question}
            index={index}
            total={quiz.questions.length}
            selected={[]}
            revealed={revealed}
            interactive={false}
            onPick={() => {}}
            mode="preview"
          />
        </div>
      </div>
    </div>
  );
}
