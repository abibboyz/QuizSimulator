"use client";

import type { MediaRef, QuizProgressStyle } from "@/types/quiz";
import { quizProgressFraction, showsPerQuestion } from "@/lib/progress";
import { MascotFigure } from "@/components/play/MascotFigure";

interface Props {
  /** Zero-based index of the question on screen. */
  index: number;
  total: number;
  /**
   * How each answered question went, in running order. Shorter than `total`
   * mid-run; empty in host mode, which doesn't score.
   */
  outcomes?: boolean[];
  style: QuizProgressStyle;
  mascot?: string;
  mascotMedia?: MediaRef;
  narrow?: boolean;
}

/**
 * How far through the quiz you are.
 *
 * Deliberately not the score: a player who is behind on points still deserves
 * to see how much is left, and on the per-question meters they get their own
 * run of right and wrong at a glance — the one piece of standing feedback that
 * isn't a number going up.
 */
export function QuizProgress({ index, total, outcomes = [], style, mascot, mascotMedia, narrow = false }: Props) {
  if (style === "none" || total <= 0) return null;

  const answered = outcomes.length;
  // Host mode never scores, so it has no outcomes to count — position is the
  // only progress it has. Solo play uses whichever is further along, which is
  // answered once a question has been submitted and index the rest of the time.
  const reached = Math.max(answered, index);
  const fraction = quizProgressFraction(reached, total);
  const label = `Question ${Math.min(index + 1, total)} of ${total}`;

  const shell = `mx-auto mb-5 w-full ${narrow ? "max-w-[26rem]" : "max-w-4xl"}`;
  const meter = { role: "progressbar" as const, "aria-valuemin": 0, "aria-valuemax": total, "aria-valuenow": reached, "aria-label": label };

  if (style === "mascot") {
    return (
      <div className={shell} {...meter}>
        <div className="relative h-9">
          <div className="absolute inset-x-0 bottom-0 h-1 rounded-full bg-white/12" />
          <div
            className="absolute bottom-0 h-1 rounded-full transition-[width] duration-300 ease-out"
            style={{ width: `${fraction * 100}%`, background: "var(--accent)" }}
          />
          <span aria-hidden className="absolute bottom-0 right-0 text-lg leading-none opacity-70">
            🏁
          </span>
          <span
            aria-hidden
            className="absolute bottom-1 grid h-7 w-7 place-items-center transition-[left] duration-300 ease-out"
            style={{ left: `${fraction * 100}%`, transform: "translateX(-50%)" }}
          >
            <MascotFigure character={mascot} media={mascotMedia} size={24} />
          </span>
        </div>
      </div>
    );
  }

  // Beyond a certain length the per-question meters are thinner than their own
  // gaps, so they degrade to a plain bar rather than becoming unreadable.
  if (showsPerQuestion(style, total)) {
    const dot = style === "dots";
    return (
      <div className={`${shell} flex items-center gap-1.5`} {...meter}>
        {Array.from({ length: total }, (_, i) => {
          // Three tiers: how it went (when that's known and allowed to show),
          // then merely been-there, then still to come.
          const known = i < answered;
          const current = i === index;
          const background = known
            ? outcomes[i]
              ? "var(--color-good)"
              : "var(--color-bad)"
            : current
              ? "var(--accent)"
              : i < reached
                ? "var(--accent-line)"
                : "rgba(255,255,255,0.14)";

          return (
            <span
              key={i}
              className={`min-w-0 flex-1 transition-all duration-300 ${dot ? "rounded-full" : "rounded-sm"} ${
                current ? "ring-2 ring-white/50" : ""
              }`}
              style={{ height: dot ? 8 : 6, background, maxWidth: dot ? 12 : undefined }}
            />
          );
        })}
      </div>
    );
  }

  return (
    <div className={shell} {...meter}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/12">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{ width: `${fraction * 100}%`, background: "var(--accent)" }}
        />
      </div>
    </div>
  );
}
