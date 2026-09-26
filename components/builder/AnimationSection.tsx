"use client";

import type { ElementMotion, MotionOverrides, Question, Quiz } from "@/types/quiz";
import { Toggle } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { MotionFields } from "@/components/builder/MotionFields";
import { MotionPreview } from "@/components/builder/MotionPreview";
import { RevealEditor } from "@/components/builder/RevealEditor";
import { resetToGlobal, resolveMotion, usesGlobal } from "@/lib/stageMotion";

interface Props {
  quiz: Quiz;
  question: Question;
  onChange: (question: Question) => void;
}

const ELEMENTS: { id: keyof MotionOverrides; label: string; hint: string }[] = [
  { id: "question", label: "Question", hint: "The prompt and its picture." },
  { id: "answers", label: "Answers", hint: "The answer tiles, one after another." },
];

function describe(m: ElementMotion): string {
  if (m.enter === "default" && m.exit === "default") return "today's look";
  return `${m.enter} in · ${m.exit} out`;
}

/**
 * The per-question "Animations & reveal" section: the Reveal picture settings
 * (Reveal questions) and this question's own entrance/exit overrides, each
 * with a "Use global" switch and a "Reset to global" button.
 */
export function AnimationSection({ quiz, question, onChange }: Props) {
  const global = resolveMotion(quiz.settings);
  const resolved = resolveMotion(quiz.settings, question);
  const overridden = !usesGlobal(question, "question") || !usesGlobal(question, "answers");

  const setOverride = (element: keyof MotionOverrides, next: ElementMotion | null) => {
    if (next === null) {
      onChange(resetToGlobal(question, element));
      return;
    }
    onChange({ ...question, motion: { ...question.motion, [element]: next } });
  };

  return (
    <section className="space-y-4 rounded-2xl border border-ink-700 p-3" aria-labelledby="anim-section-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="anim-section-title" className="text-xs font-semibold uppercase tracking-widest text-ink-400">
          Animations &amp; reveal
        </h3>
        {overridden && (
          <Button variant="ghost" size="sm" onClick={() => onChange(resetToGlobal(question))}>
            Reset all to global
          </Button>
        )}
      </div>

      {question.kind === "reveal" && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-ink-100">Reveal picture</h4>
          <RevealEditor question={question} theme={quiz.theme} onChange={onChange} />
        </div>
      )}

      <div className="space-y-3">
        <h4 className="text-sm font-semibold text-ink-100">Question &amp; answer animation</h4>
        {ELEMENTS.map(({ id, label, hint }) => {
          const inherits = usesGlobal(question, id);
          return (
            <div key={id} className="space-y-2 rounded-xl border border-ink-800 p-2.5">
              <Toggle
                checked={inherits}
                onChange={(useGlobal) => setOverride(id, useGlobal ? null : { ...global[id] })}
                label={`${label}: use global`}
                hint={inherits ? `${hint} Following the quiz: ${describe(global[id])}.` : hint}
              />
              {!inherits && (
                <>
                  <MotionFields
                    element={id}
                    value={resolved[id]}
                    onChange={(next) => setOverride(id, next)}
                    scope="This question's"
                  />
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" onClick={() => setOverride(id, null)}>
                      Reset to global
                    </Button>
                  </div>
                </>
              )}
            </div>
          );
        })}
        <MotionPreview motion={resolved} theme={quiz.theme} label="This question's" />
      </div>
    </section>
  );
}
