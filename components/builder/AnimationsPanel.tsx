"use client";

import type { ElementMotion, MotionOverrides, Quiz, QuizSettings } from "@/types/quiz";
import { Button } from "@/components/ui/Button";
import { MotionFields } from "@/components/builder/MotionFields";
import { MotionPreview } from "@/components/builder/MotionPreview";
import { isDefaultMotion, resolveMotion } from "@/lib/stageMotion";

interface Props {
  quiz: Quiz;
  onChangeSettings: (patch: Partial<QuizSettings>) => void;
}

/**
 * Quiz-wide ("global") question and answer animations. Every question follows
 * these unless it switches off "Use global" in its own Animations & reveal
 * section. Leaving everything on Default keeps today's look exactly.
 */
export function AnimationsPanel({ quiz, onChangeSettings }: Props) {
  const resolved = resolveMotion(quiz.settings);
  const custom = !isDefaultMotion(resolved);
  const overriding = quiz.questions.filter((q) => q.motion && (q.motion.question || q.motion.answers)).length;
  const reveals = quiz.questions.filter((q) => q.kind === "reveal").length;

  const set = (element: keyof MotionOverrides, next: ElementMotion) =>
    onChangeSettings({ motion: { ...quiz.settings.motion, [element]: next } });

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-ink-100">Quiz animations (global)</h3>
        <p className="text-xs text-ink-500">
          The default for every question. A question can override these in its own Animations &amp; reveal section.
          Default keeps today&apos;s look.
        </p>
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Question</h4>
        <MotionFields
          element="question"
          value={resolved.question}
          onChange={(next) => set("question", next)}
          scope="Quiz"
          stacked
        />
      </div>

      <div className="space-y-2">
        <h4 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Answers</h4>
        <MotionFields
          element="answers"
          value={resolved.answers}
          onChange={(next) => set("answers", next)}
          scope="Quiz"
          stacked
        />
      </div>

      <MotionPreview motion={resolved} theme={quiz.theme} label="Quiz" />

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-500">
        <span>
          {overriding === 0
            ? "No question overrides these."
            : `${overriding} ${overriding === 1 ? "question overrides" : "questions override"} these.`}
        </span>
        <Button
          variant="ghost"
          size="sm"
          disabled={!quiz.settings.motion}
          onClick={() => onChangeSettings({ motion: undefined })}
        >
          Reset to default{custom ? " (today's look)" : ""}
        </Button>
      </div>

      <div className="space-y-1 rounded-xl border border-ink-800 p-3 text-xs text-ink-500">
        <h4 className="font-semibold uppercase tracking-widest text-ink-400">Reveal questions</h4>
        <p>
          {reveals === 0
            ? "Add one with “+ Reveal”: image answers under one shared cover (or “?”) until the correct picture is shown."
            : `${reveals} Reveal ${reveals === 1 ? "question" : "questions"}. Each uses one cover for every answer, and uncovers only the correct picture.`}
        </p>
      </div>
    </div>
  );
}
