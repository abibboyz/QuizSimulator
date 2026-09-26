"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Question, Quiz, QuizSettings, Theme } from "@/types/quiz";
import { getQuiz } from "@/lib/storage";
import { shuffled } from "@/lib/scoring";
import { initSound, playCorrect, playCue, playUrgentTick, playWhoosh } from "@/lib/sound";
import { resolveMotion, type ResolvedMotion } from "@/lib/stageMotion";
import { resolveReveal } from "@/lib/reveal";
import { ThemeShell } from "@/components/ui/ThemeShell";
import { QuestionStage } from "@/components/play/QuestionStage";
import { ProgressMeter } from "@/components/play/ProgressMeter";
import { QuizProgress } from "@/components/play/QuizProgress";
import { TeamScoreboard } from "@/components/host/TeamScoreboard";
import { Button } from "@/components/ui/Button";
import { MuteButton } from "@/components/ui/MuteButton";
import { DEFAULT_THEME } from "@/lib/themes";

function toggleFullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => {});
}

// useSearchParams needs a Suspense boundary above it.
export default function HostPage() {
  return (
    <Suspense fallback={<Splash message="Loading quiz…" />}>
      <HostView />
    </Suspense>
  );
}

function HostView() {
  const searchParams = useSearchParams();
  // See app/play/page.tsx — query param instead of a path segment so the route
  // stays static and precacheable for offline use.
  const quizId = searchParams.get("quiz") ?? "";

  const [quiz, setQuiz] = useState<Quiz | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [questions, setQuestions] = useState<Question[]>([]);
  const [index, setIndex] = useState(0);
  const [showTeams, setShowTeams] = useState(true);

  useEffect(() => {
    initSound();
    let cancelled = false;

    void getQuiz(quizId).then((found) => {
      if (cancelled) return;
      if (!found) {
        setStatus("missing");
        return;
      }
      setQuiz(found);
      setQuestions(found.settings.shuffleQuestions ? shuffled(found.questions) : found.questions);
      setStatus("ready");
    });

    return () => {
      cancelled = true;
    };
  }, [quizId]);

  const goNext = useCallback(() => {
    setIndex((current) => Math.min(current + 1, questions.length - 1));
  }, [questions.length]);

  const goBack = useCallback(() => {
    setIndex((current) => Math.max(0, current - 1));
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      if (event.key !== "f") return;
      event.preventDefault();
      toggleFullscreen();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (status === "loading") return <Splash message="Loading quiz…" />;

  if (status === "missing" || !quiz) {
    return (
      <Splash message="That quiz doesn't exist on this device.">
        <Link href="/">
          <Button variant="primary">Back to quizzes</Button>
        </Link>
      </Splash>
    );
  }

  if (!questions.length) {
    return (
      <Splash message="This quiz has no questions yet.">
        <Link href={`/edit?quiz=${quiz.id}`}>
          <Button variant="primary">Open the builder</Button>
        </Link>
      </Splash>
    );
  }

  const question = questions[index];
  const limit = question.timerSeconds !== undefined ? question.timerSeconds : quiz.settings.timerSeconds;

  return (
    <ThemeShell theme={quiz.theme}>
      {/*
        Fixed to the viewport rather than min-height: on a 720p projector the
        controls must never be pushed below the fold where the host can't reach
        them. Anything too tall scrolls inside the stage instead.
      */}
      <div className="flex h-dvh flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 px-5 py-3 text-sm">
          <Link href="/" className="focus-ring rounded-lg px-2 py-1 text-ink-400 hover:text-ink-200">
            ← Exit
          </Link>
          <span className="truncate font-semibold text-ink-300">{quiz.title}</span>

          <div className="ml-auto flex items-center gap-2">
            <MuteButton />
            <Button variant="ghost" size="sm" onClick={() => setShowTeams((value) => !value)}>
              {showTeams ? "Hide scores" : "Show scores"}
            </Button>
            <Button variant="ghost" size="sm" onClick={toggleFullscreen}>
              Fullscreen
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1 gap-5 px-5 pb-5">
          {/*
            Keyed by question: remounting is what resets the reveal state and the
            clock, so there are no reset effects to keep in sync.
          */}
          <HostQuestion
            key={question.id}
            question={question}
            index={index}
            total={questions.length}
            limitSeconds={limit}
            soundOn={quiz.settings.sound}
            autoReveal={quiz.settings.autoReveal}
            autoAdvanceSeconds={quiz.settings.autoAdvanceSeconds}
            meter={quiz.settings}
            canBack={index > 0}
            isLast={index + 1 >= questions.length}
            onNext={goNext}
            onBack={goBack}
            theme={quiz.theme}
            motion={resolveMotion(quiz.settings, question)}
          />

          {showTeams && (
            <aside className="glass hidden w-72 shrink-0 rounded-2xl p-4 lg:block">
              <TeamScoreboard quizId={quiz.id} />
            </aside>
          )}
        </div>
      </div>
    </ThemeShell>
  );
}

interface HostQuestionProps {
  question: Question;
  index: number;
  total: number;
  limitSeconds: number | null;
  soundOn: boolean;
  autoReveal: boolean;
  autoAdvanceSeconds: number | null;
  /** Just the meter's slice of settings — the rest already arrives unpacked. */
  meter: Pick<
    QuizSettings,
    "progressStyle" | "progressPulse" | "progressMascot" | "progressMascotMedia" | "quizProgressStyle"
  >;
  canBack: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
  theme: Theme;
  /** Entrances and the Reveal uncover run here; there are no exits (each question simply remounts). */
  motion: ResolvedMotion;
}

function HostQuestion({
  question,
  index,
  total,
  limitSeconds,
  soundOn,
  autoReveal,
  autoAdvanceSeconds,
  meter,
  canBack,
  isLast,
  onNext,
  onBack,
  theme,
  motion,
}: HostQuestionProps) {
  const [revealed, setRevealed] = useState(false);
  const [remainingMs, setRemainingMs] = useState(limitSeconds === null ? null : limitSeconds * 1000);
  const [running, setRunning] = useState(limitSeconds !== null);

  const expired = remainingMs !== null && remainingMs <= 0;
  const ticking = running && !expired;

  useEffect(() => {
    if (!ticking) return;
    const id = window.setInterval(() => {
      setRemainingMs((current) => (current === null ? null : Math.max(0, current - 100)));
    }, 100);
    return () => window.clearInterval(id);
  }, [ticking]);

  useEffect(() => {
    if (expired && soundOn) playUrgentTick();
  }, [expired, soundOn]);

  const reveal = useCallback(() => {
    setRevealed(true);
    setRunning(false);
    if (soundOn) playCorrect();
    if (soundOn && question.kind === "reveal") playCue(resolveReveal(question).sound);
  }, [soundOn, question]);

  const advance = useCallback(() => {
    if (soundOn) playWhoosh();
    onNext();
  }, [onNext, soundOn]);

  // Time's up: show the answer on its own. The short beat lets the room register
  // that the clock ran out before the answer lands.
  useEffect(() => {
    if (!autoReveal || !expired || revealed) return;
    const id = window.setTimeout(reveal, 600);
    return () => window.clearTimeout(id);
  }, [autoReveal, expired, revealed, reveal]);

  // Hands-free run: roll on to the next question by itself.
  useEffect(() => {
    if (!revealed || autoAdvanceSeconds === null || isLast) return;
    const id = window.setTimeout(advance, autoAdvanceSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [revealed, autoAdvanceSeconds, isLast, advance]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Don't hijack typing in the scoreboard.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (event.key === " ") {
        event.preventDefault();
        if (revealed) advance();
        else reveal();
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        advance();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        onBack();
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, reveal, advance, onBack]);

  return (
    <main className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col justify-center overflow-y-auto py-2">
        {/* Host mode doesn't score, so there are no per-question outcomes to
            colour in — the meter shows position only. */}
        <QuizProgress
          index={index}
          total={total}
          style={meter.quizProgressStyle}
          mascot={meter.progressMascot}
          mascotMedia={meter.progressMascotMedia}
        />
        <QuestionStage
          question={question}
          index={index}
          total={total}
          selected={[]}
          revealed={revealed}
          interactive={false}
          onPick={() => {}}
          mode="host"
          theme={theme}
          motion={motion}
          header={
            remainingMs !== null && limitSeconds ? (
              <ProgressMeter
                fraction={remainingMs / (limitSeconds * 1000)}
                secondsLeft={Math.ceil(remainingMs / 1000)}
                urgent={remainingMs / (limitSeconds * 1000) <= 0.25}
                style={meter.progressStyle}
                pulse={meter.progressPulse}
                mascot={meter.progressMascot}
                mascotMedia={meter.progressMascotMedia}
                celebrate={revealed}
                size={96}
              />
            ) : null
          }
        />
      </div>

      <div className="mt-4 flex shrink-0 flex-wrap items-center justify-center gap-3">
        <Button variant="outline" onClick={onBack} disabled={!canBack}>
          ← Back
        </Button>

        {remainingMs !== null && limitSeconds !== null && (
          <>
            <Button variant="outline" onClick={() => setRunning((value) => !value)} disabled={expired}>
              {ticking ? "Pause timer" : "Start timer"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setRemainingMs(limitSeconds * 1000);
                setRunning(false);
              }}
            >
              Reset
            </Button>
          </>
        )}

        {!revealed ? (
          <Button variant="primary" size="lg" onClick={reveal}>
            Reveal answer
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={advance} disabled={isLast}>
            {isLast ? "Last question" : "Next question →"}
          </Button>
        )}
      </div>

      <p className="mt-3 shrink-0 text-center text-xs text-ink-500">
        {revealed && autoAdvanceSeconds !== null && !isLast ? (
          <span style={{ color: "var(--accent)" }}>Moving on in {autoAdvanceSeconds}s · press ← → to take over</span>
        ) : (
          <>
            Space {revealed ? "advances" : "reveals"} · ← → to move · F for fullscreen
            {autoReveal && !revealed && " · answer shows itself at zero"}
          </>
        )}
      </p>
    </main>
  );
}

function Splash({ message, children }: { message: string; children?: React.ReactNode }) {
  return (
    <ThemeShell theme={DEFAULT_THEME}>
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-lg text-ink-300">{message}</p>
        {children}
      </div>
    </ThemeShell>
  );
}
