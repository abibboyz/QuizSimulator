"use client";

import { useEffect } from "react";
import Link from "next/link";
import confetti from "canvas-confetti";
import type { Cue, Question, Quiz } from "@/types/quiz";
import type { AnswerRecord } from "@/lib/store/playSession";
import { accuracyLabel } from "@/lib/scoring";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";
import { Button } from "@/components/ui/Button";
import { playFanfare } from "@/lib/sound";
import { CuePlayer } from "@/components/play/CuePlayer";
import { RESULTS_CONFETTI } from "@/lib/playTiming";

interface Props {
  quiz: Quiz;
  order: Question[];
  answers: AnswerRecord[];
  score: number;
  bestStreak: number;
  onRetryAll: () => void;
  onRetryMissed: (ids: string[]) => void;
  /** Phone-shaped play: narrower column, stat tiles two-up instead of four. */
  narrow?: boolean;
  /** The quiz's sound setting and the device mute, already resolved. */
  soundOn: boolean;
  /** When set, replaces the stock fanfare-and-confetti ending entirely. */
  outroCue?: Cue | null;
}

export function ResultsScreen({
  quiz,
  order,
  answers,
  score,
  bestStreak,
  onRetryAll,
  onRetryMissed,
  narrow = false,
  soundOn,
  outroCue = null,
}: Props) {
  const reduced = useReducedMotion();
  const shownScore = useAnimatedNumber(score, 1100);

  const correctCount = answers.filter((a) => a.correct).length;
  const accuracy = answers.length ? correctCount / answers.length : 0;
  const verdict = accuracyLabel(accuracy);
  const missedIds = answers.filter((a) => !a.correct).map((a) => a.questionId);

  useEffect(() => {
    // An authored outro owns the ending — firing both would stack two
    // celebrations on top of each other.
    if (outroCue || !verdict.celebrate) return;
    if (soundOn) playFanfare();
    if (reduced) return;

    // Two bursts from the lower corners reads as celebration without covering
    // the score the player actually came here to see.
    const { bursts, ...common } = RESULTS_CONFETTI;
    for (const { x, y, angle } of bursts) confetti({ ...common, origin: { x, y }, angle });
  }, [verdict.celebrate, reduced, soundOn, outroCue]);

  return (
    <div className={`mx-auto flex w-full flex-col gap-8 px-5 py-10 ${narrow ? "max-w-[26rem]" : "max-w-3xl"}`}>
      {/* Nothing to resume afterwards — the run is over, so onDone just clears. */}
      {outroCue && <CuePlayer cue={outroCue} onDone={() => {}} soundOn={soundOn} />}
      <header className="animate-pop text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-ink-400">{quiz.title}</p>
        <h1 className="stage-prompt mt-2 text-5xl font-extrabold md:text-6xl" style={{ color: "var(--accent)" }}>
          {verdict.title}
        </h1>
        <p className="mt-2 text-ink-300">{verdict.blurb}</p>
      </header>

      <div className={`grid grid-cols-2 gap-3 ${narrow ? "" : "sm:grid-cols-4"}`}>
        <Stat label="Score" value={shownScore.toLocaleString()} highlight />
        <Stat label="Correct" value={`${correctCount}/${answers.length}`} />
        <Stat label="Accuracy" value={`${Math.round(accuracy * 100)}%`} />
        <Stat label="Best streak" value={String(bestStreak)} />
      </div>

      <section className="glass overflow-hidden rounded-2xl">
        <h2 className="border-b border-ink-700 px-5 py-3 text-sm font-semibold uppercase tracking-widest text-ink-300">
          Question breakdown
        </h2>
        <ol className="divide-y divide-ink-800">
          {order.map((question, i) => {
            const answer = answers.find((a) => a.questionId === question.id);
            const correctText = question.options
              .filter((o) => o.correct)
              .map((o) => o.text || "(image)")
              .join(", ");

            return (
              <li key={question.id} className="flex items-start gap-4 px-5 py-4">
                <span
                  aria-hidden
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-sm font-bold ${
                    answer?.correct ? "bg-good/20 text-good" : "bg-bad/20 text-bad"
                  }`}
                >
                  {answer?.correct ? "✓" : "✕"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-100">
                    <span className="text-ink-400">{i + 1}. </span>
                    {question.prompt || "Untitled question"}
                  </p>
                  {!answer?.correct && (
                    <p className="mt-1 text-sm text-ink-300">
                      Correct answer: <span className="font-semibold text-good">{correctText}</span>
                      {answer?.timedOut && <span className="ml-2 text-ink-500">· ran out of time</span>}
                    </p>
                  )}
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-ink-300">
                  +{(answer?.points ?? 0).toLocaleString()}
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <Button variant="primary" size="lg" onClick={onRetryAll}>
          Play again
        </Button>
        {missedIds.length > 0 && (
          <Button variant="outline" size="lg" onClick={() => onRetryMissed(missedIds)}>
            Retry {missedIds.length} missed
          </Button>
        )}
        <Link href={`/host?quiz=${quiz.id}`}>
          <Button variant="outline" size="lg">
            Run for a room
          </Button>
        </Link>
        <Link href="/">
          <Button variant="ghost" size="lg">
            All quizzes
          </Button>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="glass rounded-2xl px-4 py-4 text-center">
      <div
        className="text-2xl font-bold tabular-nums md:text-3xl"
        style={highlight ? { color: "var(--accent)" } : undefined}
      >
        {value}
      </div>
      <div className="mt-1 text-[10px] uppercase tracking-widest text-ink-400">{label}</div>
    </div>
  );
}
