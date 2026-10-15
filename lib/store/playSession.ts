"use client";

import { isSingleAnswer, isUnscoredImage, unscoredResult } from "@/lib/answerPresentation";
import { create } from "zustand";
import type { Question, Quiz } from "@/types/quiz";
import { scoreQuestion, shuffled, type ScoreResult } from "@/lib/scoring";
import { isAnswerCorrect, resolveGame, togglesPicks, toggleSequencePick } from "@/lib/gameTypes";
import { afterAnswer, afterChoice, atEnd, hasChoice, INITIAL_STARS, starPoints, type StarChoice, type StarState } from "@/lib/stars";

/**
 * "countdown" sits between the intro screen and the first question, holding the
 * timer off while a start cue plays. It is skipped entirely when no cue is set,
 * so a quiz without one goes straight to "asking" as it always did.
 */
export type Phase = "intro" | "countdown" | "asking" | "revealed" | "results";

export interface AnswerRecord {
  questionId: string;
  selectedIds: string[];
  correct: boolean;
  unscored?: boolean;
  /** A single-answer question: celebrated, never scored (also carries `unscored`). */
  single?: boolean;
  points: number;
  msTaken: number;
  timedOut: boolean;
  /** Star or Go questions: stars this answer put in the pot, and what the player chose to do with them. */
  stars?: number;
  starChoice?: StarChoice;
  /** Stars in the pot after this answer (before the choice), and what a Go would make the next correct one worth. */
  starPot?: number;
  starGoWorth?: number;
  /** Points added to the score when stars were banked on this answer (Star choice, or the end of the quiz). Absent when none. */
  starPoints?: number;
}

interface PlayState {
  quiz: Quiz | null;
  /** The running order — already shuffled if the quiz asks for it. */
  order: Question[];
  index: number;
  phase: Phase;
  score: number;
  streak: number;
  bestStreak: number;
  answers: AnswerRecord[];
  selected: string[];
  startedAt: number;
  lastResult: ScoreResult | null;
  /** Star or Go tally (lib/stars). Untouched by every other question type. */
  stars: StarState;

  start: (quiz: Quiz, onlyIds?: string[]) => void;
  /** `withIntro` keeps cue knowledge in the page; the store just holds a phase. */
  begin: (withIntro?: boolean) => void;
  /** Leaves the countdown and starts the clock on the first question. */
  ready: () => void;
  toggle: (optionId: string) => void;
  submit: (msTaken: number, timedOut?: boolean) => void;
  /** Star or Go: bank the pot (`star`) or carry it on (`go`). Without a choice the next question counts as Star. */
  chooseStar: (choice: StarChoice) => void;
  next: () => void;
  reset: () => void;
}

/** Applies the quiz's shuffle settings and narrows to a subset when retrying. */
function prepare(quiz: Quiz, onlyIds?: string[]): Question[] {
  let questions = quiz.questions;
  if (onlyIds?.length) {
    const wanted = new Set(onlyIds);
    questions = questions.filter((q) => wanted.has(q.id));
  }
  if (quiz.settings.shuffleQuestions) questions = shuffled(questions);
  if (quiz.settings.shuffleOptions) {
    // Sequence keeps its authored order: that order is the answer (it is shown shuffled by lib/gameTypes).
    questions = questions.map((q) => (q.kind === "sequence" ? q : { ...q, options: shuffled(q.options) }));
  }
  return questions;
}

export function timerFor(quiz: Quiz, question: Question | undefined): number | null {
  if (!question) return null;
  // Undefined inherits the quiz-wide timer. An explicit null/0 remains the
  // established per-question "untimed" override for backward compatibility.
  const value = question.timerSeconds !== undefined ? question.timerSeconds : quiz.settings.timerSeconds;
  if (value === null || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

export function basePointsFor(quiz: Quiz, question: Question | undefined): number {
  return question?.points ?? quiz.settings.pointsBase;
}

/** True when the picked set matches the correct set exactly. */
export function isCorrect(question: Question, selectedIds: string[]): boolean {
  // Same rule as ever for the classic kinds; Sequence also needs the authored order (lib/gameTypes).
  return isAnswerCorrect(question, selectedIds);
}

export const usePlaySession = create<PlayState>((set, get) => ({
  quiz: null,
  order: [],
  index: 0,
  phase: "intro",
  score: 0,
  streak: 0,
  bestStreak: 0,
  answers: [],
  selected: [],
  startedAt: 0,
  lastResult: null,
  stars: INITIAL_STARS,

  start: (quiz, onlyIds) =>
    set({
      quiz,
      order: prepare(quiz, onlyIds),
      index: 0,
      phase: "intro",
      score: 0,
      streak: 0,
      bestStreak: 0,
      answers: [],
      selected: [],
      startedAt: 0,
      lastResult: null,
      stars: INITIAL_STARS,
    }),

  begin: (withIntro = false) =>
    set({ phase: withIntro ? "countdown" : "asking", startedAt: Date.now(), selected: [] }),

  ready: () => {
    if (get().phase !== "countdown") return;
    set({ phase: "asking", startedAt: Date.now() });
  },

  toggle: (optionId) => {
    const { phase, order, index, selected } = get();
    if (phase !== "asking") return;

    const question = order[index];
    if (!question || isUnscoredImage(question)) return;

    if (question.kind === "multi-select" || (togglesPicks(question) && question.kind !== "sequence")) {
      set({
        selected: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      });
    } else if (question.kind === "sequence") {
      set({ selected: toggleSequencePick(selected, optionId) });
    } else {
      set({ selected: [optionId] });
    }
  },

  submit: (msTaken, timedOut = false) => {
    const state = get();
    const { quiz, order, index, selected } = state;
    if (!quiz || state.phase !== "asking") return;

    const question = order[index];
    if (!question) return;

    // A single answer always celebrates — tapped or timed out — and is never scored.
    const single = isSingleAnswer(question);
    const correct = single || (!timedOut && isCorrect(question, selected));
    const limit = timerFor(quiz, question);
    const timeLeftFraction = limit ? Math.max(0, 1 - msTaken / (limit * 1000)) : null;

    const unscored = isUnscoredImage(question) || single;
    const result = unscored ? unscoredResult(state.streak) : scoreQuestion({
      correct,
      base: basePointsFor(quiz, question),
      timeLeftFraction,
      streakBefore: state.streak,
      speedBonus: quiz.settings.speedBonus,
      streakBonus: quiz.settings.streakBonus,
    });

    // Star or Go: a correct answer puts stars in the pot; a wrong one or a timeout loses it (lib/stars).
    const starred = question.kind === "star-collect" ? afterAnswer(state.stars, correct, resolveGame(question).stars) : null;

    set({
      stars: starred ? starred.state : state.stars,
      phase: "revealed",
      score: state.score + result.points,
      streak: result.streakAfter,
      bestStreak: Math.max(state.bestStreak, result.streakAfter),
      lastResult: result,
      answers: [
        ...state.answers,
        { questionId: question.id, selectedIds: selected, correct, points: result.points, msTaken, timedOut, ...(unscored ? { unscored: true } : {}), ...(single ? { single: true } : {}), ...(starred ? { stars: starred.earned, starPot: starred.state.pot, starGoWorth: resolveGame(question).stars * (starred.state.goStreak + 2) } : {}) },
      ],
    });
  },

  chooseStar: (choice) => {
    const { phase, answers, stars } = get();
    const last = answers[answers.length - 1];
    if (phase !== "revealed" || !last || !hasChoice(last.stars ?? 0) || last.starChoice) return;
    // Star banks the pot, and banked stars are worth points (lib/stars).
    const bonus = choice === "star" ? starPoints(stars.pot, get().quiz?.settings.pointsBase) : 0;
    set({
      stars: afterChoice(stars, choice),
      score: get().score + bonus,
      answers: [...answers.slice(0, -1), { ...last, starChoice: choice, ...(bonus ? { starPoints: bonus } : {}) }],
    });
  },

  next: () => {
    // Nobody chose (auto-advance, Enter, the clock): the stars are banked.
    const pending = get().answers[get().answers.length - 1];
    if (get().phase === "revealed" && pending && hasChoice(pending.stars ?? 0) && !pending.starChoice) get().chooseStar("star");
    const { index, order } = get();
    if (index + 1 >= order.length) {
      // Whatever is still in the pot is banked, with its points, on the last answer.
      const state = get();
      const bonus = starPoints(state.stars.pot, state.quiz?.settings.pointsBase);
      const answers = state.answers;
      const last = answers[answers.length - 1];
      set({
        phase: "results",
        stars: atEnd(state.stars),
        ...(bonus && last ? { score: state.score + bonus, answers: [...answers.slice(0, -1), { ...last, starPoints: (last.starPoints ?? 0) + bonus }] } : {}),
      });
      return;
    }
    set({ index: index + 1, phase: "asking", selected: [], startedAt: Date.now(), lastResult: null });
  },

  reset: () =>
    set({
      quiz: null,
      order: [],
      index: 0,
      phase: "intro",
      score: 0,
      streak: 0,
      bestStreak: 0,
      answers: [],
      selected: [],
      startedAt: 0,
      lastResult: null,
      stars: INITIAL_STARS,
    }),
}));
