"use client";

import { LiveStage } from "@/components/play/LiveStage";

import { activeCue } from "@/lib/cues";
import { CuePlayer } from "@/components/play/CuePlayer";
import { isSingleAnswer, isUnscoredImage } from "@/lib/answerPresentation";
import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { Question, Quiz } from "@/types/quiz";
import { getQuiz } from "@/lib/storage";
import { shuffled } from "@/lib/scoring";
import { initSound, playCorrect, playCue, playUrgentTick, playWhoosh } from "@/lib/sound";
import { resolveReveal } from "@/lib/reveal";
import { questionTheme } from "@/lib/questionPresentation";
import { ThemeShell } from "@/components/ui/ThemeShell";
import { showsAutoAdvanceCountdown } from "@/lib/autoAdvance";
import { TeamScoreboard } from "@/components/host/TeamScoreboard";
import { Button } from "@/components/ui/Button";
import { MuteButton } from "@/components/ui/MuteButton";
import { DEFAULT_THEME } from "@/lib/themes";
import { ViewModeToggle, type ViewMode } from "@/components/ui/ViewModeToggle";
import { timerFor } from "@/lib/store/playSession";
import { resolveGame } from "@/lib/gameTypes";
import { INITIAL_STARS } from "@/lib/stars";

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
  const [introFinishedFor, setIntroFinishedFor] = useState<string | null>(null);
  const [showTeams, setShowTeams] = useState(true);
  const [view, setView] = useState<ViewMode>(searchParams.get("view") === "mobile" ? "mobile" : "web");

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

  const intro = activeCue(quiz, undefined, "intro");
  if (intro && introFinishedFor !== quiz.id) return <ThemeShell theme={quiz.theme}>
    <div className="min-h-dvh" aria-label="Quiz starting" />
    <CuePlayer cue={intro} soundOn={quiz.settings.sound} hideImageBox={quiz.settings.hideImageBoxes} onDone={() => setIntroFinishedFor(quiz.id)} />
  </ThemeShell>;

  const question = questions[index];
  const limit = timerFor(quiz, question);

  return (
    <ThemeShell frameOnly theme={questionTheme(quiz.theme, question)}>
      {/*
        Fixed to the viewport rather than min-height: on a 720p projector the
        controls must never be pushed below the fold where the host can't reach
        them. The question scales inside the remaining space instead of scrolling.
      */}
      <div className="flex h-dvh flex-col overflow-hidden">
        <header className="flex shrink-0 items-center gap-3 px-5 py-3 text-sm">
          <Link href="/" className="focus-ring rounded-lg px-2 py-1 text-ink-400 hover:text-ink-200">
            ← Exit
          </Link>
          <span className="truncate font-semibold text-ink-300">{quiz.title}</span>

          <div className="ml-auto flex items-center gap-2">
            <ViewModeToggle value={view} onChange={setView} />
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
            quiz={quiz}
            order={questions}
            question={question}
            index={index}
            view={view}
            limitSeconds={limit}
            soundOn={quiz.settings.sound}
            autoReveal={quiz.settings.autoReveal}
            autoAdvanceSeconds={quiz.settings.autoAdvanceSeconds}
            showAutoAdvanceCountdown={showsAutoAdvanceCountdown(quiz.settings)}
            canBack={index > 0}
            isLast={index + 1 >= questions.length}
            onNext={goNext}
            onBack={goBack}
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
  quiz: Quiz;
  order: Question[];
  question: Question;
  index: number;
  view: ViewMode;
  limitSeconds: number | null;
  soundOn: boolean;
  autoReveal: boolean;
  autoAdvanceSeconds: number | null;
  showAutoAdvanceCountdown: boolean;
  canBack: boolean;
  isLast: boolean;
  onNext: () => void;
  onBack: () => void;
}

function HostQuestion({
  quiz,
  order,
  question,
  index,
  view,
  limitSeconds,
  soundOn,
  autoReveal,
  autoAdvanceSeconds,
  showAutoAdvanceCountdown,
  canBack,
  isLast,
  onNext,
  onBack,
}: HostQuestionProps) {
  const unscored = isUnscoredImage(question);
  const [revealed, setRevealed] = useState(false);
  const [revealComplete, setRevealComplete] = useState(false);
  const celebrationReady = question.kind !== "reveal" || revealComplete;
  const [remainingMs, setRemainingMs] = useState(limitSeconds === null ? null : limitSeconds * 1000);
  const [running, setRunning] = useState(limitSeconds !== null);

  const expired = remainingMs !== null && remainingMs <= 0;
  const ticking = running && !expired;

  useEffect(() => {
    if (!ticking || remainingMs === null) return;
    const startedAt = performance.now();
    const startedWith = remainingMs;
    let frame = 0;

    const step = (now: number) => {
      const next = Math.max(0, startedWith - (now - startedAt));
      setRemainingMs(next);
      if (next > 0) frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // A pause or expiry ends this run. Deliberately do not depend on
    // remainingMs: every animation frame updates it, but must not restart the
    // clock or the mascot would appear stuck at the starting line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticking]);

  useEffect(() => {
    if (expired && soundOn) playUrgentTick();
  }, [expired, soundOn]);

  const reveal = useCallback(() => {
    setRevealed(true);
    setRunning(false);
    if (soundOn && !unscored) playCorrect();
    if (soundOn && question.kind === "reveal") playCue(resolveReveal(question).sound);
  }, [soundOn, question, unscored]);

  const advance = useCallback(() => {
    if (soundOn) playWhoosh();
    onNext();
  }, [onNext, soundOn]);

  useEffect(() => {
    if (!unscored || !expired || isLast) return;
    onNext();
  }, [unscored, expired, isLast, onNext]);

  // Time's up: show the answer on its own. The short beat lets the room register
  // that the clock ran out before the answer lands.
  // A single answer always celebrates when the clock runs out, auto-reveal or not.
  const single = isSingleAnswer(question);
  useEffect(() => {
    if (unscored || !(autoReveal || single) || !expired || revealed) return;
    const id = window.setTimeout(reveal, 600);
    return () => window.clearTimeout(id);
  }, [unscored, autoReveal, single, expired, revealed, reveal]);

  // Hands-free run: roll on to the next question by itself.
  useEffect(() => {
    if (!revealed || autoAdvanceSeconds === null || isLast || (question.celebration?.enabled && !celebrationReady)) return;
    const id = window.setTimeout(advance, autoAdvanceSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [revealed, autoAdvanceSeconds, isLast, advance, question.celebration?.enabled, celebrationReady]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      // Don't hijack typing in the scoreboard.
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;

      if (event.key === " ") {
        event.preventDefault();
        if (revealed || unscored) advance();
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
  }, [revealed, reveal, advance, onBack, unscored]);


  return (
    <main className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        <LiveStage
          quiz={quiz}
          order={order}
          index={index}
          framing={view === "mobile" ? "vertical" : "horizontal"}
          selected={[]}
          revealed={revealed}
          remainingMs={remainingMs}
          limitSeconds={limitSeconds}
          correct={revealed && !unscored}
          onRevealComplete={() => setRevealComplete(true)}
          // Star or Go in host mode: the room sees the stars appear and talks it through; there is no per-player tally.
          stars={revealed && question.kind === "star-collect" ? { earned: resolveGame(question).stars, choice: null, pot: resolveGame(question).stars, goWorth: resolveGame(question).stars * 2, after: INITIAL_STARS } : undefined}
          countdownSeconds={showAutoAdvanceCountdown && revealed && autoAdvanceSeconds !== null && !isLast && (!question.celebration?.enabled || celebrationReady) ? autoAdvanceSeconds : undefined}
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

        {!revealed && !unscored ? (
          <Button variant="primary" size="lg" onClick={reveal}>
            Reveal answer
          </Button>
        ) : (
          <Button variant="primary" size="lg" onClick={advance} disabled={isLast}>
            {isLast ? "Last question" : "Next question →"}
          </Button>
        )}
      </div>


      {!(showAutoAdvanceCountdown && revealed && autoAdvanceSeconds !== null && !isLast && (!question.celebration?.enabled || celebrationReady)) && (
        <p className="mt-3 shrink-0 text-center text-xs text-ink-500">
          Space {revealed || unscored ? "advances" : "reveals"} · ← → to move · F for fullscreen
          {!unscored && autoReveal && !revealed && " · answer shows itself at zero"}
        </p>
      )}
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
