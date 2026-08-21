"use client";

import { listQuizzes, saveQuiz } from "@/lib/storage";
import { sampleQuiz } from "@/lib/sampleQuiz";

const SEEDED_KEY = "quizsim:seeded";

/**
 * Seeds the sample quiz on a brand-new install, exactly once.
 *
 * The work is held in a module-level promise rather than run inline: React
 * mounts effects twice in development, and two concurrent seed attempts would
 * race — one writing the quiz while the other reads an empty list and renders
 * "no quizzes". Both callers awaiting the same promise makes it deterministic.
 *
 * The localStorage flag means deleting the sample doesn't bring it back.
 */
let seeding: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seeding) {
    seeding = (async () => {
      if (window.localStorage.getItem(SEEDED_KEY)) return;

      const existing = await listQuizzes();
      if (!existing.length) await saveQuiz(sampleQuiz());

      window.localStorage.setItem(SEEDED_KEY, "1");
    })();
  }
  return seeding;
}
