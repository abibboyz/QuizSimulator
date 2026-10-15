/**
 * Star or Go (the `star-collect` question type): the rules, in one place.
 *
 * A star-collect question is an ordinary question (same answers, same score,
 * same streak). Stars are a separate tally that sits beside the score:
 *
 *  - Answer correctly and you win `stars` x (1 + goStreak) stars, put in the
 *    pot. goStreak is how many times in a row you chose Go.
 *  - Then choose:
 *      Star: bank the whole pot. goStreak goes back to 0.
 *      Go:   keep the pot and carry on. goStreak goes up by 1, so the next
 *            correct star-collect answer is worth more (x2, x3, ...).
 *  - Answer wrongly, or run out of time: the pot is lost (banked stars are safe)
 *    and goStreak goes back to 0.
 *  - Nobody chose (auto-advance, Enter, the clock): that counts as Star.
 *  - Whatever is still in the pot when the quiz ends is banked.
 *
 * Other question types never touch the tally. Points are not affected: stars
 * are their own meter, shown beside the score and on the results screen.
 */

export interface StarState {
  /** Stars won but not banked yet. */
  pot: number;
  /** Stars banked for good. */
  banked: number;
  /** Consecutive Go choices carried into the next star question. */
  goStreak: number;
}

export type StarChoice = "star" | "go";

export const INITIAL_STARS: StarState = { pot: 0, banked: 0, goStreak: 0 };

/** Stars the next correct answer is worth. */
export function starsWorth(base: number, state: StarState): number {
  return Math.max(0, Math.round(base)) * (1 + state.goStreak);
}

/** The tally right after a star-collect question is answered (before the choice). */
export function afterAnswer(state: StarState, correct: boolean, base: number): { state: StarState; earned: number } {
  if (!correct) return { state: { pot: 0, banked: state.banked, goStreak: 0 }, earned: 0 };
  const earned = starsWorth(base, state);
  return { state: { ...state, pot: state.pot + earned }, earned };
}

/** The tally after the player's choice. Only meaningful when the pot is not empty. */
export function afterChoice(state: StarState, choice: StarChoice): StarState {
  if (choice === "star") return { pot: 0, banked: state.banked + state.pot, goStreak: 0 };
  return { ...state, goStreak: state.goStreak + 1 };
}

/** The tally at the end of the quiz: whatever is still in the pot is banked. */
export function atEnd(state: StarState): StarState {
  return { pot: 0, banked: state.banked + state.pot, goStreak: 0 };
}

/** True when there is a decision to make after this answer (a correct answer put stars in the pot). */
export function hasChoice(earned: number): boolean {
  return earned > 0;
}
