import type { Question, Quiz } from "@/types/quiz";
import { SCHEMA_VERSION } from "@/types/quiz";
import { DEFAULT_SETTINGS, newId } from "@/lib/factory";
import { DEFAULT_THEME, getPreset } from "@/lib/themes";

interface Seed {
  prompt: string;
  answers: string[];
  correct: number;
  explanation?: string;
  trueFalse?: boolean;
}

const SEEDS: Seed[] = [
  {
    prompt: "Which planet has the most confirmed moons?",
    answers: ["Jupiter", "Saturn", "Neptune", "Uranus"],
    correct: 1,
    explanation: "Saturn overtook Jupiter in 2023 and now sits at 274 confirmed moons.",
  },
  {
    prompt: "Bananas are berries, but strawberries aren't.",
    answers: ["True", "False"],
    correct: 0,
    trueFalse: true,
    explanation: "Botanically a berry comes from one flower with one ovary — a banana qualifies, a strawberry doesn't.",
  },
  {
    prompt: "Which of these is NOT a real programming language?",
    answers: ["Rust", "Kotlin", "Basilisk", "Erlang"],
    correct: 2,
    explanation: "Basilisk is a physics solver, not a language. The other three are all in production use today.",
  },
  {
    prompt: "What is the capital of Australia?",
    answers: ["Sydney", "Melbourne", "Canberra", "Perth"],
    correct: 2,
    explanation: "Canberra was purpose-built as a compromise after Sydney and Melbourne both wanted the title.",
  },
  {
    prompt: "Which animal has three hearts?",
    answers: ["Octopus", "Camel", "Komodo dragon", "Platypus"],
    correct: 0,
    explanation: "Two pump blood to the gills, one to the rest of the body — and it stops when the octopus swims.",
  },
  {
    prompt: "Which of these was invented first?",
    answers: ["The microwave oven", "The fax machine", "The TV remote", "The nuclear reactor"],
    correct: 1,
    explanation: "The fax machine was patented in 1843 — decades before the telephone, let alone the others.",
  },
  {
    prompt: "How many bones are in the adult human body?",
    answers: ["186", "206", "246", "266"],
    correct: 1,
    explanation: "Babies start with about 270; many fuse together on the way to adulthood.",
  },
  {
    prompt: "In what year did the first iPhone go on sale?",
    answers: ["2005", "2006", "2007", "2009"],
    correct: 2,
    explanation: "29 June 2007 — and it couldn't record video, copy text, or install third-party apps.",
  },
];

/**
 * A ready-to-run quiz so a brand-new install has something to play immediately.
 * Ids are generated per call, so seeding twice yields two independent quizzes.
 */
export function sampleQuiz(): Quiz {
  const now = Date.now();
  const preset = getPreset("neon");

  const questions: Question[] = SEEDS.map((seed) => ({
    id: newId(),
    kind: seed.trueFalse ? "true-false" : "multiple-choice",
    layout: seed.trueFalse ? "big-text" : "grid",
    prompt: seed.prompt,
    explanation: seed.explanation,
    options: seed.answers.map((text, i) => ({ id: newId(), text, correct: i === seed.correct })),
  }));

  return {
    id: newId(),
    title: "Pub Quiz Starter Pack",
    description: "Eight rounds of general knowledge to try the simulator out.",
    theme: {
      ...DEFAULT_THEME,
      preset: "neon",
      bgAnimation: preset.defaultBg,
      accent: preset.accent,
      surface: preset.surface,
      font: "display",
    },
    settings: { ...DEFAULT_SETTINGS },
    questions,
    createdAt: now,
    updatedAt: now,
    schemaVersion: SCHEMA_VERSION,
  };
}
