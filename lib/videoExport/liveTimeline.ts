import type { Timeline } from "./timeline.ts";
import type { StarChoice, StarState } from "../stars.ts";

export interface LiveFrameState {
  index: number;
  elapsedMs: number;
  remainingMs: number | null;
  limitSeconds: number | null;
  revealAt: number | null;
  picks: { optionId: string; at: number }[];
  correct: boolean;
  outcomes: (boolean | null)[];
  exitAt?: number;
  countdown?: { at: number; seconds: number };
  /** Game clock origin of the game question types: when the stage became live. Unset = now (the stage just mounted). */
  gameAt?: number | null;
  /** Star or Go, from the play session: what the answer earned and what the player chose. Absent before the reveal. */
  stars?: { earned: number; choice: StarChoice | null; choiceAt: number | null; pot: number; goWorth: number; after: StarState };
}

/** Adapt a privately owned export timeline to actual player/host events.
 * No simulated picks, timeout, cue or automatic advance may drive live play.
 */
export function syncLiveTimeline(timeline: Timeline, state: LiveFrameState): void {
  timeline.intro.end = 0;
  timeline.results.start = Infinity;
  timeline.cues = [];
  timeline.confetti = [];
  timeline.questions.forEach((run, index) => {
    const current = index === state.index;
    const previous = index < state.index;
    run.enterAt = previous ? index - state.index : current ? 0 : Infinity;
    run.mountAt = run.enterAt;
    run.animateIn = false;
    run.exitAt = current ? state.exitAt ?? Infinity : Infinity;
    run.animateOut = current && state.exitAt !== undefined;
    run.advanceAt = Infinity;
    run.timeoutBar = current && !!state.countdown;
    run.countdownAt = current ? state.countdown?.at : undefined;
    if (current && state.countdown) run.holdSeconds = state.countdown.seconds;
    run.revealAt = current ? state.revealAt ?? Infinity : previous ? run.enterAt : Infinity;
    run.correct = current ? state.correct : state.outcomes[index] === true;
    run.picks = current ? state.picks : [];
    // Game question types: live play is driven by the player, never by the simulated drag or star choice.
    run.drag = undefined;
    run.gameAt = current ? state.gameAt ?? state.elapsedMs : Infinity;
    run.stars = current && state.stars && state.revealAt !== null
      ? {
          earned: state.stars.earned,
          appearAt: state.revealAt + 250,
          choiceAt: state.stars.earned > 0 ? state.revealAt + 250 + 260 + state.stars.earned * 220 : null,
          tapAt: state.stars.choiceAt,
          choice: state.stars.choice,
          pot: state.stars.pot,
          goWorth: state.stars.goWorth,
          after: state.stars.after,
        }
      : undefined;
    run.selectedIds = run.picks.map((pick) => pick.optionId);
    if (current) {
      run.limitSeconds = state.limitSeconds;
      const elapsed = state.limitSeconds === null ? 0 : Math.max(0, state.limitSeconds * 1000 - (state.remainingMs ?? 0));
      run.liveAt = state.elapsedMs - elapsed;
      run.frozenElapsedMs = elapsed;
    }
  });
}
