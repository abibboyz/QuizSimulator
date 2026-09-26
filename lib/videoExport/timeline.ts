/**
 * The whole solo run, laid out on a clock before a single frame is drawn.
 *
 * The play screen is event-driven — timers, effects and cue callbacks hand the
 * run from one phase to the next. A video can't be: every frame has to be
 * reproducible from nothing but its timestamp. This module replays the play
 * screen's rules (app/play/page.tsx, CuePlayer, useCountdown, ResultsScreen)
 * once, up front, and records *when* each thing happens. The renderer then
 * answers "what does the screen look like at t?" by reading this, and the
 * audio track is scheduled from the very same events, so picture and sound
 * can't disagree.
 *
 * Everything that decides timing is imported from where the app itself reads
 * it (cue resolution, hold clamps, scoring, the shared constants in
 * lib/playTiming) rather than copied, so the two can't drift.
 *
 * All times are milliseconds from the start of the video.
 */

import type { Cue, CueSlot, MediaRef, Question, Quiz } from "@/types/quiz";
import { activeCue, cueHoldMs } from "@/lib/cues";
import { revealHoldSeconds, shouldAutoAdvanceAfterTimeout } from "@/lib/autoAdvance";
import { accuracyLabel, scoreQuestion } from "@/lib/scoring";
import { basePointsFor, isCorrect, timerFor } from "@/lib/store/playSession";
import {
  COUNTDOWN_BEATS,
  CUE_CONFETTI,
  QUESTION_SWAP,
  RESULTS_CONFETTI,
  REVEAL_OFF_HOLD_MS,
  timerTickKind,
  type ConfettiPreset,
} from "@/lib/playTiming";
import { CUE_SOUND_RECIPES, type RecipeId } from "@/lib/sound";
import { exitPhaseMs, resolveMotion, swapOutDelayMs, usesSwapIn, usesSwapOut, type ResolvedMotion } from "@/lib/stageMotion";
import { resolveReveal } from "@/lib/reveal";

/* ----------------------------------------------------------------- options */

/**
 * - `pick-correct`: a simulated player picks the right answer shortly before
 *   the clock runs out, so the video shows the select ring and a real
 *   correct-answer reveal (score, streak, correct cue).
 * - `timeout`: nobody touches anything — exactly what the app does when a
 *   solo run is left alone: the clock runs out, the answer is shown, the miss
 *   cue plays, and "Out of time — next question in 5s" carries it on.
 */
export type AnswerMode = "pick-correct" | "timeout";

export interface TimelineOptions {
  answerMode: AnswerMode;
  /** Build the audio events at all. */
  sound: boolean;
}

/*
 * The only timings here that don't come from the app — each one fills a gap
 * where the live run would be waiting on a human.
 */

/** A simulated pick locks in with about this much left on the clock. */
export const PICK_LEAD_MS = 1000;
/**
 * How long the select ring stays up before the reveal. In real play a tap on
 * a single-answer question reveals instantly, which on video reads as nothing
 * happening; this beat matches host mode's 600ms "let the room register" pause.
 */
export const PICK_BEAT_MS = 600;
/** Gap between picks on a pick-all-that-apply question. */
export const MULTI_PICK_GAP_MS = 350;
/** Untimed questions would wait forever for a player; the video gives them this long. */
export const UNTIMED_THINK_MS = 8000;
/** With no start cue the run would open straight on question 1; the video shows the title card this long first. */
export const TITLE_CARD_MS = 1200;
/** Minimum time the results screen stays up at the end of the video. */
export const RESULTS_HOLD_MS = 4000;

/* ------------------------------------------------------------------- types */

export type AudioEvent = { at: number; recipe: RecipeId } | { at: number; sample: MediaRef };

export interface CueInstance {
  cue: Cue;
  slot: CueSlot;
  start: number;
  /** Nominal hold, as CuePlayer computes it. */
  hold: number;
  /** When the overlay actually goes away — earlier than start + hold if the run replaced it. */
  end: number;
}

export interface ConfettiInstance {
  at: number;
  preset: ConfettiPreset;
  seed: number;
}

export interface Pick {
  optionId: string;
  at: number;
}

export interface QuestionRun {
  index: number;
  question: Question;
  /** The run's index moves to this question (QuizProgress updates here). */
  enterAt: number;
  /** The question's DOM mounts — after the previous one's exit has finished. */
  mountAt: number;
  /** Slides in from `mountAt` (false for the first question: AnimatePresence initial={false}). */
  animateIn: boolean;
  /** The clock starts: nothing is covering the stage any more. */
  liveAt: number;
  /** Seconds on the clock, or null when the question is untimed (no meter drawn). */
  limitSeconds: number | null;
  picks: Pick[];
  revealAt: number;
  /** Elapsed clock time at which the meter froze. */
  frozenElapsedMs: number;
  correct: boolean;
  timedOut: boolean;
  selectedIds: string[];
  points: number;
  scoreBefore: number;
  scoreAfter: number;
  streakBefore: number;
  streakAfter: number;
  /** "Out of time — next question in Ns" is on screen during the reveal hold. */
  timeoutBar: boolean;
  holdSeconds: number;
  /** The run moves on (goNext). */
  advanceAt: number;
  /** The question leaves (index moves on, or results take over). */
  exitAt: number;
  /** False for the last question: the results screen replaces the stage outright. */
  animateOut: boolean;
  /** Quiz-wide animation settings with this question's overrides (lib/stageMotion). */
  motion: ResolvedMotion;
  /** How long it takes to leave: custom exits, then the stage swap if it uses one. */
  exitMs: number;
  /** When the stage swap-out starts, after `exitAt` (custom exits play first). */
  swapOutDelayMs: number;
}

export interface Timeline {
  durationMs: number;
  intro: { start: number; end: number; cue: Cue | null };
  questions: QuestionRun[];
  results: {
    start: number;
    end: number;
    correctCount: number;
    total: number;
    score: number;
    bestStreak: number;
  };
  cues: CueInstance[];
  confetti: ConfettiInstance[];
  audio: AudioEvent[];
}

/* -------------------------------------------------------------- the build */

const SWAP_MS = QUESTION_SWAP.durationS * 1000;

export function buildTimeline(quiz: Quiz, options: TimelineOptions): Timeline {
  // The authored order. Shuffle settings are ignored on purpose so the same
  // quiz always exports the same video.
  const questions = quiz.questions;
  const settings = quiz.settings;

  const cues: CueInstance[] = [];
  const confetti: ConfettiInstance[] = [];
  const audio: AudioEvent[] = [];
  let seed = 1;

  // One cue at a time, like the play screen's `pending` slot: showing a new
  // one, or clearing, ends whatever was up.
  let pending: CueInstance | null = null;
  const endPending = (at: number) => {
    if (pending && pending.end > at) pending.end = at;
    pending = null;
  };
  const showCue = (cue: Cue, slot: CueSlot, at: number) => {
    endPending(at);
    const hold = cueHoldMs(cue);
    const instance: CueInstance = { cue, slot, start: at, hold, end: at + hold };
    cues.push(instance);
    pending = instance;
    fireCueEffects(instance);
    return instance;
  };
  // The results screen's outro runs in its own CuePlayer, outside `pending`.
  const fireCueEffects = (instance: CueInstance) => {
    const { cue, start } = instance;
    if (cue.sound === "custom") {
      if (cue.soundMedia) audio.push({ at: start, sample: cue.soundMedia });
    } else if (cue.sound) {
      audio.push({ at: start, recipe: CUE_SOUND_RECIPES[cue.sound] });
    }
    if (cue.animation === "confetti") confetti.push({ at: start, preset: CUE_CONFETTI, seed: seed++ });
  };

  /* ---- intro */
  const introCue = activeCue(quiz, undefined, "intro");
  let clock = 0;
  if (introCue) {
    const instance = showCue(introCue, "intro", 0);
    clock = instance.hold;
    // handleCueDone clears the intro and starts question 1.
    endPending(clock);
  } else {
    clock = TITLE_CARD_MS;
  }
  const intro = { start: 0, end: clock, cue: introCue };

  /* ---- questions */
  const runs: QuestionRun[] = [];
  let score = 0;
  let streak = 0;
  let bestStreak = 0;
  let correctCount = 0;

  let enterAt = clock;
  let mountAt = clock;
  let liveAt = clock;

  questions.forEach((question, index) => {
    const limitSeconds = timerFor(quiz, question);
    const thinkMs = limitSeconds !== null ? limitSeconds * 1000 : UNTIMED_THINK_MS;

    let picks: Pick[] = [];
    let revealAt: number;
    let timedOut: boolean;

    const toPick = options.answerMode === "pick-correct" ? correctPicks(question) : [];
    if (toPick.length) {
      const span = PICK_BEAT_MS + (toPick.length - 1) * MULTI_PICK_GAP_MS;
      const offset = Math.max(thinkMs - PICK_LEAD_MS, Math.min(span + 300, thinkMs * 0.9));
      revealAt = liveAt + offset;
      picks = toPick.map((optionId, i) => ({
        optionId,
        at: Math.max(liveAt, revealAt - PICK_BEAT_MS - (toPick.length - 1 - i) * MULTI_PICK_GAP_MS),
      }));
      timedOut = false;
      for (const pick of picks) audio.push({ at: pick.at, recipe: "select" });
    } else {
      revealAt = liveAt + thinkMs;
      timedOut = true;
    }

    const msTaken = revealAt - liveAt;

    // useCountdown: one tick per whole second remaining, while the clock runs.
    if (limitSeconds !== null) {
      const limitMs = limitSeconds * 1000;
      const heart = settings.progressPulse === "heartbeat";
      for (let secondsLeft = limitSeconds; secondsLeft >= 0; secondsLeft--) {
        const elapsed = (limitSeconds - secondsLeft) * 1000;
        const at = liveAt + elapsed;
        // A pick stops the clock before its tick; a timeout ticks on zero.
        if (timedOut ? at > revealAt : at >= revealAt) break;
        // +1ms: the rAF step that notices a second change always lands just after it.
        const kind = timerTickKind(elapsed + 1, limitMs, secondsLeft);
        if (kind) audio.push({ at, recipe: heart ? "heartbeat" : kind === "urgent" ? "urgentTick" : "tick" });
      }
    }

    const selectedIds = picks.map((p) => p.optionId);
    const correct = !timedOut && isCorrect(question, selectedIds);
    const result = scoreQuestion({
      correct,
      base: basePointsFor(quiz, question),
      timeLeftFraction: limitSeconds ? Math.max(0, 1 - msTaken / (limitSeconds * 1000)) : null,
      streakBefore: streak,
      speedBonus: settings.speedBonus,
      streakBonus: settings.streakBonus,
    });
    const scoreBefore = score;
    const streakBefore = streak;
    score += result.points;
    streak = result.streakAfter;
    bestStreak = Math.max(bestStreak, streak);
    if (correct) correctCount += 1;

    // Reveal feedback: an authored cue replaces the stock chime entirely.
    const feedback = settings.revealAfterEach ? activeCue(quiz, question, correct ? "correct" : "wrong") : null;
    if (feedback) showCue(feedback, correct ? "correct" : "wrong", revealAt);
    else audio.push({ at: revealAt, recipe: correct ? "correct" : "wrong" });

    // A Reveal question's picture uncovers with the answer, with its own sound (play page's reveal effect).
    if (question.kind === "reveal" && settings.revealAfterEach) {
      const sound = resolveReveal(question).sound;
      if (sound && sound !== "custom") audio.push({ at: revealAt, recipe: CUE_SOUND_RECIPES[sound] });
    }

    const holdSeconds = revealHoldSeconds(settings);
    const timeoutBar = shouldAutoAdvanceAfterTimeout(settings, "revealed", {
      questionId: question.id,
      selectedIds,
      correct,
      points: result.points,
      msTaken,
      timedOut,
    });
    // A player who answered would be left to click on; the video carries on
    // after the same hold the timeout path uses.
    const advanceAt = settings.revealAfterEach ? revealAt + holdSeconds * 1000 : revealAt + REVEAL_OFF_HOLD_MS;

    // goNext(false): the automatic path — no stock whoosh.
    const isLast = index + 1 >= questions.length;
    const between = isLast ? null : activeCue(quiz, question, "between");
    let swapAt: number;
    let nextLiveAt: number;
    if (between) {
      const instance = showCue(between, "between", advanceAt);
      // The transition swaps the question at its midpoint; the clock waits for the end.
      swapAt = advanceAt + instance.hold / 2;
      nextLiveAt = advanceAt + instance.hold;
      pending = instance;
    } else {
      endPending(advanceAt);
      swapAt = advanceAt;
      nextLiveAt = advanceAt;
    }

    const motion = resolveMotion(settings, question);
    const exitMs = exitPhaseMs(motion, question.options.length);

    runs.push({
      index,
      question,
      enterAt,
      mountAt,
      animateIn: index > 0,
      liveAt,
      limitSeconds,
      picks,
      revealAt,
      frozenElapsedMs: msTaken,
      correct,
      timedOut,
      selectedIds,
      points: result.points,
      scoreBefore,
      scoreAfter: score,
      streakBefore,
      streakAfter: streak,
      timeoutBar,
      holdSeconds,
      advanceAt,
      exitAt: swapAt,
      animateOut: !isLast,
      motion,
      exitMs,
      swapOutDelayMs: swapOutDelayMs(motion, question.options.length),
    });

    enterAt = swapAt;
    // AnimatePresence mode="wait": the next question mounts once this one has
    // finished leaving — SWAP_MS for today's default look.
    mountAt = swapAt + exitMs;
    liveAt = nextLiveAt;
    if (between) endPending(nextLiveAt);
    clock = swapAt;
  });

  /* ---- results */
  const resultsStart = clock;
  const outroCue = activeCue(quiz, undefined, "outro");
  const verdict = accuracyLabel(questions.length ? correctCount / questions.length : 0);
  let resultsEnd = resultsStart + RESULTS_HOLD_MS;
  if (outroCue) {
    const hold = cueHoldMs(outroCue);
    const instance: CueInstance = { cue: outroCue, slot: "outro", start: resultsStart, hold, end: resultsStart + hold };
    cues.push(instance);
    fireCueEffects(instance);
    resultsEnd = Math.max(resultsEnd, resultsStart + hold + 1500);
  } else if (verdict.celebrate) {
    audio.push({ at: resultsStart, recipe: "fanfare" });
    confetti.push({ at: resultsStart, preset: RESULTS_CONFETTI, seed: seed++ });
  }

  // The 3-2-1 beeps belong to the countdown overlay, so they stop with it.
  for (const instance of cues) {
    if (instance.cue.animation !== "countdown") continue;
    const perBeat = instance.hold / COUNTDOWN_BEATS.length;
    COUNTDOWN_BEATS.forEach((_, beat) => {
      const at = instance.start + beat * perBeat;
      if (at >= instance.end) return;
      audio.push({ at, recipe: beat === COUNTDOWN_BEATS.length - 1 ? "countdownGo" : "countdownBeep" });
    });
  }

  audio.sort((a, b) => a.at - b.at);

  return {
    durationMs: Math.ceil(resultsEnd),
    intro,
    questions: runs,
    results: {
      start: resultsStart,
      end: resultsEnd,
      correctCount,
      total: questions.length,
      score,
      bestStreak,
    },
    cues,
    confetti,
    audio: options.sound ? audio : [],
  };
}

/**
 * What a player who knows the answer would pick. Single-answer questions lock
 * in on the first tap, so only one option; pick-all-that-apply taps each
 * correct option in turn.
 */
function correctPicks(question: Question): string[] {
  const correct = question.options.filter((o) => o.correct).map((o) => o.id);
  if (!correct.length) return [];
  return question.kind === "multi-select" ? correct : [correct[0]];
}

/* ----------------------------------------------------------- frame lookup */

/** The question whose index is current at t (QuizProgress, score). */
export function currentRunIndex(timeline: Timeline, t: number): number {
  const runs = timeline.questions;
  let found = -1;
  for (let i = 0; i < runs.length; i++) {
    if (runs[i].enterAt <= t) found = i;
    else break;
  }
  return found;
}

export type Scene =
  | { kind: "intro" }
  | { kind: "stage"; index: number; shown: QuestionRun; motion: "enter" | "exit" | "still"; progress: number }
  | { kind: "results" };

export function sceneAt(timeline: Timeline, t: number): Scene {
  if (t < timeline.intro.end || !timeline.questions.length) {
    return t >= timeline.results.start && timeline.questions.length === 0 ? { kind: "results" } : { kind: "intro" };
  }
  if (t >= timeline.results.start) return { kind: "results" };

  const index = currentRunIndex(timeline, t);
  const run = timeline.questions[index];
  // AnimatePresence mode="wait": until the new question mounts, the previous
  // one is still on its way out.
  if (index > 0 && t < run.mountAt) {
    const previous = timeline.questions[index - 1];
    // `progress` is the stage swap-out's; custom exits read the clock themselves.
    return {
      kind: "stage",
      index,
      shown: previous,
      motion: usesSwapOut(previous.motion) ? "exit" : "still",
      progress: usesSwapOut(previous.motion)
        ? clamp01((t - previous.exitAt - previous.swapOutDelayMs) / SWAP_MS)
        : 1,
    };
  }
  if (run.animateIn && usesSwapIn(run.motion) && t < run.mountAt + SWAP_MS) {
    return { kind: "stage", index, shown: run, motion: "enter", progress: clamp01((t - run.mountAt) / SWAP_MS) };
  }
  return { kind: "stage", index, shown: run, motion: "still", progress: 1 };
}

export function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}
