/** Question and prompt settings clipboard, separate from whole-question copy. */
import type { BgImageFit, Question } from "@/types/quiz";

export const QUESTION_SETTINGS_KEY = "quiz-simulator-question-text-settings";
/** Alias for backwards compatibility with storage.ts and existing storage keys */
export const QUESTION_TEXT_SETTINGS_KEY = QUESTION_SETTINGS_KEY;

export interface QuestionSettings {
  version: 1;
  sourceQuizId: string;
  promptStyle?: Question["promptStyle"];
  answerStyle?: Question["answerStyle"];
  hideImageBoxes?: boolean;
  hideAnswerBoxes?: boolean;
  layout?: Question["layout"];
  promptPlacement?: Question["promptPlacement"];
  promptArea?: Question["promptArea"];
  imageArea?: Question["imageArea"];
  stageLayout?: Question["stageLayout"];
  timerPlacement?: Question["timerPlacement"];
  optionGap?: number;
  imageJoinerStyle?: Question["imageJoinerStyle"];
  timerSeconds?: number | null;
  points?: number;
  loopMotion?: Question["loopMotion"];
  motion?: Question["motion"];
  cues?: Question["cues"];
  reveal?: Partial<NonNullable<Question["reveal"]>>;
  celebration?: Partial<NonNullable<Question["celebration"]>>;
  background?: { enabled: boolean; fit?: BgImageFit; dim?: number };
}

export type QuestionTextSettings = QuestionSettings;

export function readQuestionSettings(): QuestionSettings | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(QUESTION_SETTINGS_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<QuestionSettings>;
    if (value.version !== 1 || typeof value.sourceQuizId !== "string") return null;
    return value as QuestionSettings;
  } catch {
    return null;
  }
}

export const readQuestionTextSettings = readQuestionSettings;

export function writeQuestionSettings(settings: QuestionSettings): void {
  localStorage.setItem(QUESTION_SETTINGS_KEY, JSON.stringify(settings));
}

export const writeQuestionTextSettings = writeQuestionSettings;

