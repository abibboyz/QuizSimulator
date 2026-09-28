/**
 * The solo question timer's readout, as a pure function of the clock state.
 *
 * The clock is tagged with the question it was measuring. A clock left over
 * from an earlier question reads as a fresh, full timer: the play screen used
 * to show the previous question's frozen value (e.g. "3" where the new one
 * should say "10") from the moment the next question appeared behind a
 * between cue until the clock restarted about 250ms later.
 *
 * Runtime imports stay relative so `node --test` can load this.
 */

export interface CountdownClock {
  /** Which question run the elapsed time belongs to. */
  key: string | number | null;
  elapsedMs: number;
}

export interface CountdownView {
  elapsedMs: number;
  remainingMs: number;
  /** 1 at the start, 0 when time is up. `1` for untimed questions. */
  fraction: number;
  urgent: boolean;
}

/** Elapsed time for `key`: whatever the clock measured for it, else 0. */
export function elapsedFor(clock: CountdownClock, key: string | number | null): number {
  return clock.key === key ? Math.max(0, clock.elapsedMs) : 0;
}

export function countdownView(seconds: number | null, elapsedMs: number): CountdownView {
  if (seconds === null) return { elapsedMs, remainingMs: 0, fraction: 1, urgent: false };
  const limit = seconds * 1000;
  const remainingMs = Math.max(0, limit - elapsedMs);
  const fraction = limit > 0 ? Math.max(0, Math.min(1, remainingMs / limit)) : 0;
  return { elapsedMs, remainingMs, fraction, urgent: fraction <= 0.25 };
}
