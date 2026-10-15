import type { Quiz } from "@/types/quiz";

/**
 * A quiz of only the pre-existing question types, written out by hand so it does not depend on any
 * factory default. legacyTimeline.golden.json was generated from this by the code on main (before the game
 * question types); legacyTimeline.test.ts proves the timeline for these questions is still the same.
 */
export function legacyQuiz(): Quiz {
  const pic = { kind: "stored" as const, id: "pic", w: 800, h: 450 };
  return {
    id: "legacy",
    title: "Legacy fixture",
    createdAt: 1,
    updatedAt: 1,
    schemaVersion: 10,
    theme: {} as Quiz["theme"],
    settings: { cues: {}, timerSeconds: 12, timeoutRevealSeconds: 2, revealAfterEach: true, sound: false } as Quiz["settings"],
    questions: [
      { id: "l1", kind: "multiple-choice", layout: "grid", prompt: "Plain multiple choice", explanation: "Because.", media: pic,
        options: [{ id: "l1a", text: "Paris", correct: true }, { id: "l1b", text: "Rome", correct: false }, { id: "l1c", text: "Oslo", correct: false }, { id: "l1d", text: "Lima", correct: false }] },
      { id: "l2", kind: "true-false", layout: "big-text", prompt: "True or false?",
        options: [{ id: "l2a", text: "True", correct: true }, { id: "l2b", text: "False", correct: false }] },
      { id: "l3", kind: "multi-select", layout: "list", prompt: "Pick all that apply", timerSeconds: 8,
        options: [{ id: "l3a", text: "One", correct: true }, { id: "l3b", text: "Two", correct: true }, { id: "l3c", text: "Three", correct: false }] },
      { id: "l4", kind: "image-choice", layout: "grid", prompt: "Which is Oslo?", optionGap: 12,
        options: [{ id: "l4a", text: "", correct: false, media: pic }, { id: "l4b", text: "Oslo", correct: true, media: pic }] },
      { id: "l5", kind: "reveal", layout: "grid", prompt: "Which city is under the cover?", optionGap: 12,
        options: [{ id: "l5a", text: "Paris", correct: true, media: pic }, { id: "l5b", text: "Rome", correct: false, media: pic }],
        reveal: { animation: "tiles", cover: { kind: "stored", id: "cover", w: 1200, h: 400 }, durationMs: 1000 } },
    ] as Quiz["questions"],
  } as Quiz;
}
