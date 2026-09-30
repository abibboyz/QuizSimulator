"use client";

import type { Question, Quiz } from "@/types/quiz";
import { LoopMotionFields } from "@/components/builder/LoopMotionFields";
import { resolveLoops } from "@/lib/loopMotion";
import { RevealEditor } from "@/components/builder/RevealEditor";

export function AnimationSection({ quiz, question, onChange }: {
  quiz: Quiz; question: Question; onChange: (question: Question) => void;
}) {
  return <section className="space-y-4 rounded-2xl border border-ink-700 p-3" aria-label="Continuous animations">
    <h3 className="text-sm font-semibold">Continuous animations</h3>
    <p className="text-xs text-ink-500">Choose a repeating effect or move once and stay. Inherit uses the global setting; Off disables motion locally.</p>
    {(["question", "answers"] as const).map((element) => <LoopMotionFields key={element}
      label={element === "question" ? "Question movement" : "Answer movement"}
      inherited={resolveLoops(quiz.settings)[element]} value={question.loopMotion?.[element]}
      onChange={(value) => onChange({ ...question, loopMotion: { ...question.loopMotion, [element]: value } })} />)}
    <details className="rounded-xl border border-ink-700 p-3">
      <summary className="cursor-pointer text-sm font-semibold">Individual answer movement</summary>
      <div className="mt-3 space-y-2">{question.options.map((option, i) => <LoopMotionFields key={option.id}
        label={`Answer ${i + 1}${option.text ? ` · ${option.text}` : ""}`}
        inherited={resolveLoops(quiz.settings, question).answers} value={option.loopMotion}
        onChange={(value) => onChange({ ...question, options: question.options.map((o) => o.id === option.id ? { ...o, loopMotion: value } : o) })} />)}</div>
    </details>
    {question.kind === "reveal" && <div className="space-y-2">
      <h4 className="text-sm font-semibold">Reveal picture</h4>
      <RevealEditor question={question} theme={quiz.theme} onChange={onChange} />
    </div>}
  </section>;
}
