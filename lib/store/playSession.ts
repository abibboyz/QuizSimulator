"use client";

import { create } from "zustand";
import type { Question, Quiz } from "@/types/quiz";
import { scoreQuestion, shuffled, type ScoreResult } from "@/lib/scoring";

export type Phase = "intro" | "asking" | "revealed" | "results";

export interface AnswerRecord {
  questionId: string;
  selectedIds: string[];
  correct: boolean;
  points: number;
  msTaken: number;
  timedOut: boolean;
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

  start: (quiz: Quiz, onlyIds?: string[]) => void;
  begin: () => void;
  toggle: (optionId: string) => void;
  submit: (msTaken: number, timedOut?: boolean) => void;
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
    questions = questions.map((q) => ({ ...q, options: shuffled(q.options) }));
  }
  return questions;
}

export function timerFor(quiz: Quiz, question: Question | undefined): number | null {
  if (!question) return null;
  return question.timerSeconds !== undefined ? question.timerSeconds : quiz.settings.timerSeconds;
}

export function basePointsFor(quiz: Quiz, question: Question | undefined): number {
  return question?.points ?? quiz.settings.pointsBase;
}

/** True when the picked set matches the correct set exactly. */
export function isCorrect(question: Question, selectedIds: string[]): boolean {
  const correct = question.options.filter((o) => o.correct).map((o) => o.id);
  if (!correct.length) return false;
  const picked = new Set(selectedIds);
  return correct.length === picked.size && correct.every((id) => picked.has(id));
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
    }),

  begin: () => set({ phase: "asking", startedAt: Date.now(), selected: [] }),

  toggle: (optionId) => {
    const { phase, order, index, selected } = get();
    if (phase !== "asking") return;

    const question = order[index];
    if (!question) return;

    if (question.kind === "multi-select") {
      set({
        selected: selected.includes(optionId)
          ? selected.filter((id) => id !== optionId)
          : [...selected, optionId],
      });
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

    const correct = !timedOut && isCorrect(question, selected);
    const limit = timerFor(quiz, question);
    const timeLeftFraction = limit ? Math.max(0, 1 - msTaken / (limit * 1000)) : null;

    const result = scoreQuestion({
      correct,
      base: basePointsFor(quiz, question),
      timeLeftFraction,
      streakBefore: state.streak,
      speedBonus: quiz.settings.speedBonus,
      streakBonus: quiz.settings.streakBonus,
    });

    set({
      phase: "revealed",
      score: state.score + result.points,
      streak: result.streakAfter,
      bestStreak: Math.max(state.bestStreak, result.streakAfter),
      lastResult: result,
      answers: [
        ...state.answers,
        { questionId: question.id, selectedIds: selected, correct, points: result.points, msTaken, timedOut },
      ],
    });
  },

  next: () => {
    const { index, order } = get();
    if (index + 1 >= order.length) {
      set({ phase: "results" });
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
    }),
}));
