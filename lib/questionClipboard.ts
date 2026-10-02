import type { Question, Quiz } from "@/types/quiz";
import { duplicateQuestion, newId } from "@/lib/factory";
import { questionMediaRefs, remapQuestionMedia } from "@/lib/mediaRefs";
import { clearQuestionClipboard, readQuestionClipboard, writeQuestionClipboard } from "@/lib/questionClipboardState";
import { getMedia, putMediaRecord, releaseCopiedQuestionMedia, saveQuiz } from "@/lib/storage";

/** Keeps a private copy of every picture and cue sound before the source changes. */
export async function copyQuestion(sourceQuizId: string, question: Question): Promise<void> {
  const previous = readQuestionClipboard();
  const refs = questionMediaRefs(question);
  const ids = [...new Set(refs.filter((ref) => ref.kind === "stored").map((ref) => ref.id))];
  const records = await Promise.all(ids.map((id) => getMedia(id)));
  if (records.some((record) => !record)) throw new Error("One of this question's stored pictures or sounds is missing.");

  const remap = new Map<string, string>();
  try {
    for (let i = 0; i < ids.length; i++) {
      const next = newId();
      await putMediaRecord({ ...records[i]!, id: next, createdAt: Date.now() });
      remap.set(ids[i], next);
    }
    writeQuestionClipboard(sourceQuizId, remapQuestionMedia(question, remap));
  } catch (error) {
    // A quota failure can interrupt a copy after some blobs were written.
    await releaseCopiedQuestionMedia(remapQuestionMedia(question, remap)).catch(() => {});
    throw error;
  }
  if (previous) await releaseCopiedQuestionMedia(previous.question).catch(() => {});
}

/** Inserts after the selected question, saves, then consumes the clipboard. */
export async function pasteQuestion(quiz: Quiz, afterId: string | null): Promise<{ quiz: Quiz; question: Question } | null> {
  const copied = readQuestionClipboard();
  if (!copied) return null;
  if (copied.sourceQuizId === quiz.id) return null;
  for (const ref of questionMediaRefs(copied.question)) {
    if (ref.kind === "stored" && !(await getMedia(ref.id))) {
      throw new Error("A copied picture or sound is missing. Copy the question again.");
    }
  }
  const question = duplicateQuestion(copied.question);
  const at = quiz.questions.findIndex((item) => item.id === afterId);
  const questions = [...quiz.questions];
  questions.splice(at < 0 ? questions.length : at + 1, 0, question);
  const next = { ...quiz, questions };
  await saveQuiz(next);
  clearQuestionClipboard();
  return { quiz: next, question };
}
