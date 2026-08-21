"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { QuizSummary } from "@/types/quiz";
import { duplicateQuiz, estimateUsage, listQuizzes, removeQuiz, saveQuiz } from "@/lib/storage";
import { exportQuizFile, importBundle, readFileText, TransferError } from "@/lib/transfer";
import { getQuiz } from "@/lib/storage";
import { createQuiz } from "@/lib/factory";
import { sampleQuiz } from "@/lib/sampleQuiz";
import { ensureSeeded } from "@/lib/seed";
import { formatBytes } from "@/lib/media";
import { getPreset, withAlpha } from "@/lib/themes";
import { Button } from "@/components/ui/Button";
import { AnimatedBackground } from "@/components/bg/AnimatedBackground";
import { DEFAULT_THEME } from "@/lib/themes";
import { ViewModeToggle, VIEW_KEY, type ViewMode } from "@/components/ui/ViewModeToggle";



export default function Dashboard() {
  const router = useRouter();
  const [quizzes, setQuizzes] = useState<QuizSummary[] | null>(null);
  const [usage, setUsage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>("web");
  const fileRef = useRef<HTMLInputElement>(null);

  // Remembers the last choice, and starts on mobile for touch devices — where
  // the web layout would be the wrong default anyway.
  useEffect(() => {
    const saved = window.localStorage.getItem(VIEW_KEY);
    const guess: ViewMode =
      saved === "mobile" || saved === "web"
        ? saved
        : window.matchMedia("(pointer: coarse)").matches
          ? "mobile"
          : "web";
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setView(guess);
  }, []);

  const chooseView = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  };

  const refresh = useCallback(async () => {
    setQuizzes(await listQuizzes());
    const estimate = await estimateUsage();
    setUsage(estimate ? formatBytes(estimate.bytes) : null);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      // Gives a fresh install something to play immediately.
      await ensureSeeded();
      const list = await listQuizzes();

      if (cancelled) return;
      setQuizzes(list);
      const estimate = await estimateUsage();
      if (!cancelled) setUsage(estimate ? formatBytes(estimate.bytes) : null);
    };

    void load().catch((e) => setError(e instanceof Error ? e.message : "Couldn't open local storage."));
    return () => {
      cancelled = true;
    };
  }, []);

  const handleNew = async () => {
    const quiz = createQuiz();
    await saveQuiz(quiz);
    router.push(`/edit/${quiz.id}`);
  };

  const handleImport = async (file: File) => {
    setError(null);
    try {
      const quiz = await importBundle(await readFileText(file));
      await refresh();
      router.push(`/edit/${quiz.id}`);
    } catch (e) {
      setError(e instanceof TransferError ? e.message : "That file couldn't be imported.");
    }
  };

  const handleExport = async (id: string) => {
    const quiz = await getQuiz(id);
    if (quiz) await exportQuizFile(quiz);
  };

  const handleDelete = async (summary: QuizSummary) => {
    if (!window.confirm(`Delete "${summary.title}"? This can't be undone.`)) return;
    await removeQuiz(summary.id);
    await refresh();
  };

  return (
    <div className="relative min-h-dvh">
      <AnimatedBackground kind="aurora" accent={DEFAULT_THEME.accent} glow="#6366f1" surface="#070b1a" subtle />

      <main className="mx-auto w-full max-w-6xl px-5 py-10 md:py-16">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="stage-prompt text-4xl font-extrabold md:text-5xl">
              Quiz <span style={{ color: "var(--accent)" }}>Simulator</span>
            </h1>
            <p className="mt-2 max-w-xl text-ink-300">
              Build a quiz, theme it, then run it solo or throw it on the big screen for a room.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleImport(file);
                event.target.value = "";
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              Import
            </Button>
            <Button variant="primary" onClick={handleNew}>
              + New quiz
            </Button>
          </div>
        </header>

        {error && (
          <div className="mt-6 rounded-xl border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {quizzes === null && <p className="mt-12 text-ink-400">Loading your quizzes…</p>}

        {quizzes?.length === 0 && (
          <div className="glass mt-12 rounded-3xl px-8 py-16 text-center">
            <h2 className="text-2xl font-bold">No quizzes yet</h2>
            <p className="mx-auto mt-2 max-w-md text-ink-300">
              Start from scratch, or drop in the sample pack to see how a finished quiz behaves.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button variant="primary" onClick={handleNew}>
                Create a quiz
              </Button>
              <Button
                variant="outline"
                onClick={async () => {
                  await saveQuiz(sampleQuiz());
                  await refresh();
                }}
              >
                Add the sample quiz
              </Button>
            </div>
          </div>
        )}

        {!!quizzes?.length && (
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {quizzes.map((quiz) => {
              const preset = getPreset(quiz.theme.preset);
              return (
                <article
                  key={quiz.id}
                  className="glass group relative flex flex-col overflow-hidden rounded-2xl transition hover:-translate-y-0.5"
                  style={{ boxShadow: `0 18px 40px -28px ${quiz.theme.accent}` }}
                >
                  <div
                    className="h-24 w-full"
                    style={{
                      background: `radial-gradient(120% 140% at 20% 0%, ${withAlpha(quiz.theme.accent, 0.55)}, ${withAlpha(preset.glow, 0.25)} 60%, transparent 100%)`,
                    }}
                  />

                  <div className="flex flex-1 flex-col gap-3 p-5">
                    <div>
                      <h2 className="text-lg font-bold leading-tight">{quiz.title || "Untitled quiz"}</h2>
                      <p className="mt-1 line-clamp-2 text-sm text-ink-400">
                        {quiz.description || "No description"}
                      </p>
                    </div>

                    <p className="text-xs uppercase tracking-widest text-ink-500">
                      {quiz.questionCount} {quiz.questionCount === 1 ? "question" : "questions"} ·{" "}
                      {new Date(quiz.updatedAt).toLocaleDateString()}
                    </p>

                    <div className="mt-auto flex flex-wrap items-center gap-2 pt-2">
                      <Link href={`/play/${quiz.id}?view=${view}`} className="flex-1">
                        <Button variant="primary" size="sm" className="w-full">
                          Play
                        </Button>
                      </Link>
                      {/* Sits on the Play button so the shape is chosen before the quiz opens. */}
                      <ViewModeToggle value={view} onChange={chooseView} />
                      <Link href={`/host/${quiz.id}`}>
                        <Button variant="outline" size="sm">
                          Host
                        </Button>
                      </Link>
                      <Link href={`/edit/${quiz.id}`}>
                        <Button variant="outline" size="sm">
                          Edit
                        </Button>
                      </Link>
                    </div>

                    <div className="flex gap-1 border-t border-ink-800 pt-3 text-xs">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          await duplicateQuiz(quiz.id);
                          await refresh();
                        }}
                      >
                        Duplicate
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleExport(quiz.id)}>
                        Export
                      </Button>
                      <Button variant="ghost" size="sm" className="ml-auto text-bad" onClick={() => handleDelete(quiz)}>
                        Delete
                      </Button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-2 border-t border-ink-800 pt-6 text-xs text-ink-500">
          <p>Everything is stored in this browser. Export a quiz to move it somewhere else.</p>
          {usage && <p>Using {usage} of local storage</p>}
        </footer>
      </main>
    </div>
  );
}
