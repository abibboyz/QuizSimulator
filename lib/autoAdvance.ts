import type { QuizSettings } from "@/types/quiz";
import type { AnswerRecord } from "@/lib/store/playSession";
import type { Phase } from "@/lib/store/playSession";

/**
 * Whether solo play should show the answer for a beat and then carry on by
 * itself.
 *
 * This only applies to a question that ran out of time with nothing picked:
 * there's no decision left for the player to make, so waiting on a click just
 * stalls the run. A question the player actually answered stays put, so they
 * can read the explanation at their own pace.
 */
export function shouldAutoAdvanceAfterTimeout(
  settings: Pick<QuizSettings, "revealAfterEach" | "autoAdvanceOnTimeout">,
  phase: Phase,
  lastAnswer: AnswerRecord | undefined,
): boolean {
  if (phase !== "revealed") return false;
  if (!settings.autoAdvanceOnTimeout) return false;
  // With reveal-after-each off, a different path already moves things along;
  // two timers racing to call next() would skip a question.
  if (!settings.revealAfterEach) return false;
  return lastAnswer?.timedOut === true;
}

/** Clamped so a bad stored value can't leave the quiz stuck or flash past. */
export function revealHoldSeconds(settings: Pick<QuizSettings, "timeoutRevealSeconds">): number {
  const seconds = Number(settings.timeoutRevealSeconds);
  if (!Number.isFinite(seconds)) return 5;
  return Math.min(60, Math.max(1, Math.round(seconds)));
}
