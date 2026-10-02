/** Small, one-use cross-quiz clipboard. Media blobs stay in IndexedDB. */
import type { Question } from "@/types/quiz";

export const QUESTION_CLIPBOARD_KEY = "quiz-simulator-question-clipboard";

interface QuestionClipboard {
  version: 1;
  sourceQuizId: string;
  question: Question;
}

export function readQuestionClipboard(): QuestionClipboard | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(QUESTION_CLIPBOARD_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<QuestionClipboard>;
    const question = value.question;
    return value.version === 1 && typeof value.sourceQuizId === "string" && question && typeof question.id === "string" && Array.isArray(question.options)
      ? value as QuestionClipboard
      : null;
  } catch {
    return null;
  }
}

export function writeQuestionClipboard(sourceQuizId: string, question: Question): void {
  localStorage.setItem(QUESTION_CLIPBOARD_KEY, JSON.stringify({ version: 1, sourceQuizId, question } satisfies QuestionClipboard));
}

export function clearQuestionClipboard(): void {
  localStorage.removeItem(QUESTION_CLIPBOARD_KEY);
}
