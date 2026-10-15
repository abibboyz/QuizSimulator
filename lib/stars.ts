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
 * Points: banked stars also add to the score, only on quizzes with a Star or Go
 * question. A star is worth a tenth of the quiz's base points per question
 * (`pointsBase`, 1000 by default, so 100 points a star), added at the moment the
 * stars are banked (Star, no choice, or the end of the quiz). Stars in the pot,
 * or lost with a wrong answer, are worth nothing. Streaks and the points of
 * every other question are not affected.
 *
 * Other question types never touch the tally or the score through it.
 */

export interface StarState {
  /** Stars won but not banked yet. */
  pot: number;
  /** Stars banked for good. */
  banked: number;
  /** Consecutive Go choices carried into the next star question. */
  goStreak: number;
}

/** The base points a quiz without its own setting uses. */
const DEFAULT_POINTS_BASE = 1000;

/** Points one banked star is worth: a tenth of the quiz's base points (1000 -> 100). */
export function starValue(pointsBase: number | undefined): number {
  return Math.max(0, Math.round((typeof pointsBase === "number" && Number.isFinite(pointsBase) ? pointsBase : DEFAULT_POINTS_BASE) / 10));
}

/** Points for banking `stars` stars. */
export function starPoints(stars: number, pointsBase: number | undefined): number {
  return Math.max(0, Math.round(stars)) * starValue(pointsBase);
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
