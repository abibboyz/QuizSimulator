"use client";

import type { Quiz, QuizSettings } from "@/types/quiz";
import { LoopMotionFields } from "@/components/builder/LoopMotionFields";
import { DEFAULT_LOOP } from "@/lib/loopMotion";

export function AnimationsPanel({ quiz, onChangeSettings }: {
  quiz: Quiz; onChangeSettings: (patch: Partial<QuizSettings>) => void;
}) {
  return <section className="space-y-4" aria-label="Global continuous animations">
    <h3 className="text-sm font-semibold">Continuous animations · global</h3>
    <p className="text-xs text-ink-500">Choose effects that repeat for as long as the question is on screen, or move once and stay. Combine two effects or choose just one. Every question inherits these unless it has a local override. Default: Off.</p>
    {(["question", "answers"] as const).map((element) => <LoopMotionFields key={element}
      label={element === "question" ? "Global question movement" : "Global answer movement"}
      value={quiz.settings.loopMotion?.[element] ?? DEFAULT_LOOP}
      onChange={(value) => onChangeSettings({ loopMotion: { ...quiz.settings.loopMotion, [element]: value } })} />)}
    <p className="text-xs text-ink-500">Reduced-motion preferences turn continuous animations off.</p>
  </section>;
}
