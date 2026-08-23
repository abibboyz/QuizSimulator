"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Question, QuestionKind, Quiz, QuizSettings, Theme } from "@/types/quiz";
import { validateQuiz } from "@/types/quiz";
import { getQuiz, saveQuiz } from "@/lib/storage";
import { createQuestion, duplicateQuestion } from "@/lib/factory";
import { exportQuizFile } from "@/lib/transfer";
import { themeVars } from "@/lib/themes";
import { Button } from "@/components/ui/Button";
import { QuestionList } from "@/components/builder/QuestionList";
import { QuestionEditor } from "@/components/builder/QuestionEditor";
import { ThemePanel } from "@/components/builder/ThemePanel";
import { SettingsPanel } from "@/components/builder/SettingsPanel";
import { PreviewPane } from "@/components/builder/PreviewPane";

type Tab = "preview" | "theme" | "settings";
type SaveState = "clean" | "saving" | "saved";

// useSearchParams needs a Suspense boundary above it.
export default function EditPage() {
  return (
    <Suspense fallback={<Centered>Loading builder…</Centered>}>
      <EditView />
    </Suspense>
  );
}

function EditView() {
  const searchParams = useSearchParams();
  // See app/play/page.tsx — query param instead of a path segment so the route
  // stays static and precacheable for offline use.
  const quizId = searchParams.get("quiz") ?? "";

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("preview");
  const [saveState, setSaveState] = useState<SaveState>("clean");

  // Distinguishes "loaded from disk" from "edited by the user", so opening a
  // quiz doesn't immediately mark it dirty and rewrite updatedAt.
  const dirtyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    void getQuiz(quizId).then((found) => {
      if (cancelled) return;
      if (!found) {
        setStatus("missing");
        return;
      }
      setQuiz(found);
      setActiveId(found.questions[0]?.id ?? null);
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [quizId]);

  // Debounced autosave. 500ms is long enough to coalesce typing, short enough
  // that closing the tab mid-thought doesn't cost anything.
  useEffect(() => {
    if (!quiz || !dirtyRef.current) return;
    setSaveState("saving");

    const timer = window.setTimeout(() => {
      void saveQuiz(quiz).then(() => setSaveState("saved"));
    }, 500);

    return () => window.clearTimeout(timer);
  }, [quiz]);

  const mutate = useCallback((updater: (current: Quiz) => Quiz) => {
    dirtyRef.current = true;
    setQuiz((current) => (current ? updater(current) : current));
  }, []);

  const patchQuiz = useCallback((patch: Partial<Quiz>) => mutate((q) => ({ ...q, ...patch })), [mutate]);

  const patchSettings = useCallback(
    (patch: Partial<QuizSettings>) => mutate((q) => ({ ...q, settings: { ...q.settings, ...patch } })),
    [mutate],
  );

  const patchTheme = useCallback((theme: Theme) => mutate((q) => ({ ...q, theme })), [mutate]);

  const updateQuestion = useCallback(
    (next: Question) => mutate((q) => ({ ...q, questions: q.questions.map((item) => (item.id === next.id ? next : item)) })),
    [mutate],
  );

  const addQuestion = useCallback(
    (kind: QuestionKind = "multiple-choice") => {
      const question = createQuestion(kind);
      mutate((q) => ({ ...q, questions: [...q.questions, question] }));
      setActiveId(question.id);
    },
    [mutate],
  );

  const duplicate = useCallback(
    (id: string) =>
      mutate((q) => {
        const index = q.questions.findIndex((item) => item.id === id);
        if (index === -1) return q;
        const copy = duplicateQuestion(q.questions[index]);
        const questions = [...q.questions];
        questions.splice(index + 1, 0, copy);
        setActiveId(copy.id);
        return { ...q, questions };
      }),
    [mutate],
  );

  const remove = useCallback(
    (id: string) =>
      mutate((q) => {
        if (q.questions.length <= 1) return q;
        const index = q.questions.findIndex((item) => item.id === id);
        const questions = q.questions.filter((item) => item.id !== id);
        // Land on the neighbour rather than dumping the user back to nothing.
        setActiveId((current) => (current === id ? questions[Math.min(index, questions.length - 1)]?.id ?? null : current));
        return { ...q, questions };
      }),
    [mutate],
  );

  const issues = useMemo(() => (quiz ? validateQuiz(quiz) : []), [quiz]);
  const errors = issues.filter((issue) => issue.severity === "error");
  const invalidIds = useMemo(
    () => new Set(issues.map((issue) => issue.questionId).filter((id): id is string => !!id)),
    [issues],
  );

  const active = quiz?.questions.find((q) => q.id === activeId) ?? quiz?.questions[0] ?? null;
  const activeIndex = quiz && active ? quiz.questions.findIndex((q) => q.id === active.id) : 0;

  if (status === "loading") {
    return <Centered>Loading builder…</Centered>;
  }

  if (status === "missing" || !quiz) {
    return (
      <Centered>
        <p className="mb-4">That quiz doesn&apos;t exist on this device.</p>
        <Link href="/">
          <Button variant="primary">Back to quizzes</Button>
        </Link>
      </Centered>
    );
  }

  return (
    <div className="min-h-dvh bg-ink-950" style={themeVars(quiz.theme)}>
      <header className="sticky top-0 z-20 border-b border-ink-800 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/" className="focus-ring rounded-lg px-2 py-1 text-sm text-ink-400 hover:text-ink-200">
            ← Quizzes
          </Link>

          <input
            value={quiz.title}
            onChange={(event) => patchQuiz({ title: event.target.value })}
            className="focus-ring min-w-0 flex-1 rounded-lg bg-transparent px-2 py-1 text-lg font-bold text-ink-100 hover:bg-ink-900"
            placeholder="Untitled quiz"
            aria-label="Quiz title"
          />

          <span className="text-xs text-ink-500" aria-live="polite">
            {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>

          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => exportQuizFile(quiz)}>
              Export
            </Button>
            <Link href={`/host?quiz=${quiz.id}`}>
              <Button variant="outline" size="sm">
                Host
              </Button>
            </Link>
            <Link href={`/play?quiz=${quiz.id}`}>
              <Button variant="primary" size="sm">
                Play
              </Button>
            </Link>
          </div>
        </div>

        {errors.length > 0 && (
          <div className="border-t border-amber-500/20 bg-amber-500/10 px-4 py-2 text-center text-xs text-amber-200">
            {errors[0].message}
            {errors.length > 1 && <span className="text-amber-300/70"> · and {errors.length - 1} more</span>}
          </div>
        )}
      </header>

      <main className="mx-auto grid max-w-[1600px] gap-4 px-4 py-5 lg:grid-cols-[19rem_minmax(0,1fr)_22rem]">
        <aside className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-ink-400">
              {quiz.questions.length} {quiz.questions.length === 1 ? "question" : "questions"}
            </h2>
          </div>

          <QuestionList
            questions={quiz.questions}
            activeId={active?.id ?? null}
            invalidIds={invalidIds}
            onSelect={setActiveId}
            onReorder={(questions) => patchQuiz({ questions })}
            onDuplicate={duplicate}
            onDelete={remove}
          />

          <div className="grid grid-cols-3 gap-2">
            <Button variant="outline" size="sm" onClick={() => addQuestion("multiple-choice")}>
              + Choice
            </Button>
            <Button variant="outline" size="sm" onClick={() => addQuestion("true-false")}>
              + T/F
            </Button>
            <Button variant="outline" size="sm" onClick={() => addQuestion("multi-select")}>
              + Multi
            </Button>
          </div>
        </aside>

        <section className="glass min-w-0 rounded-2xl p-5">
          {active ? (
            <QuestionEditor quiz={quiz} question={active} index={activeIndex} onChange={updateQuestion} />
          ) : (
            <p className="text-ink-400">Add a question to get started.</p>
          )}
        </section>

        <aside className="space-y-3">
          <div className="flex gap-1 rounded-xl border border-ink-700 bg-ink-900/50 p-1">
            {(["preview", "theme", "settings"] as Tab[]).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`focus-ring flex-1 rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition ${
                  tab === id ? "bg-ink-800 text-ink-100" : "text-ink-400 hover:text-ink-200"
                }`}
              >
                {id}
              </button>
            ))}
          </div>

          <div className="glass rounded-2xl p-4">
            {tab === "preview" &&
              (active ? (
                <PreviewPane quiz={quiz} question={active} index={activeIndex} />
              ) : (
                <p className="text-sm text-ink-400">Nothing to preview yet.</p>
              ))}
            {tab === "theme" && <ThemePanel theme={quiz.theme} onChange={patchTheme} />}
            {tab === "settings" && (
              <SettingsPanel quiz={quiz} onChangeQuiz={patchQuiz} onChangeSettings={patchSettings} />
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 text-center text-ink-300">{children}</div>
  );
}
