"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { getQuiz } from "@/lib/storage";
import { basePointsFor, timerFor, usePlaySession } from "@/lib/store/playSession";
import { useCountdown } from "@/hooks/useCountdown";
import { initSound, playCorrect, playSelect, playWhoosh, playWrong } from "@/lib/sound";
import { ThemeShell } from "@/components/ui/ThemeShell";
import { QuestionStage } from "@/components/play/QuestionStage";
import { TimerRing } from "@/components/play/TimerRing";
import { ScoreBadge } from "@/components/play/ScoreBadge";
import { ResultsScreen } from "@/components/play/ResultsScreen";
import { AutoAdvanceBar } from "@/components/play/AutoAdvanceBar";
import { revealHoldSeconds, shouldAutoAdvanceAfterTimeout } from "@/lib/autoAdvance";
import { Button } from "@/components/ui/Button";
import { DEFAULT_THEME } from "@/lib/themes";
import { ViewModeToggle, VIEW_KEY, type ViewMode } from "@/components/ui/ViewModeToggle";

// useSearchParams needs a Suspense boundary above it.
export default function PlayPage() {
  return (
    <Suspense fallback={<Splash message="Loading quiz…" />}>
      <PlayView />
    </Suspense>
  );
}

function PlayView() {
  const params = useParams<{ quizId: string }>();
  const quizId = params.quizId;

  const searchParams = useSearchParams();
  const [view, setView] = useState<ViewMode>(searchParams.get("view") === "mobile" ? "mobile" : "web");
  const mobile = view === "mobile";

  const chooseView = (next: ViewMode) => {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  };

  /** Phone-width column; on a big screen it gets a device frame so the shape reads as deliberate. */
  const stageWidth = mobile
    ? "max-w-[26rem] lg:rounded-[2rem] lg:border lg:border-ink-700/80 lg:bg-ink-950/30 lg:shadow-2xl"
    : "max-w-4xl";

  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);

  const session = usePlaySession();
  const { quiz, order, index, phase, score, streak, bestStreak, answers, selected } = session;
  const question = order[index];

  const startedAtRef = useRef(0);

  useEffect(() => {
    initSound();
    let cancelled = false;

    void getQuiz(quizId).then((found) => {
      if (cancelled) return;
      if (!found) {
        setMissing(true);
      } else {
        session.start(found);
      }
      setLoaded(true);
    });

    return () => {
      cancelled = true;
      session.reset();
    };
    // Restarting on quizId alone is intentional — the session store is the
    // single source of truth once a quiz is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const limit = quiz ? timerFor(quiz, question) : null;
  const soundOn = quiz?.settings.sound ?? false;

  const handleExpire = useCallback(() => {
    if (limit === null) return;
    usePlaySession.getState().submit(limit * 1000, true);
  }, [limit]);

  const countdown = useCountdown(phase === "asking", limit, soundOn, handleExpire);

  // Mark the wall-clock start of each question so untimed play can still record
  // how long an answer took.
  useEffect(() => {
    if (phase === "asking") startedAtRef.current = Date.now();
  }, [phase, index]);

  // Reveal feedback: fires once per scored answer.
  const answerCount = answers.length;
  useEffect(() => {
    if (phase !== "revealed" || !answerCount || !soundOn) return;
    if (answers[answerCount - 1].correct) playCorrect();
    else playWrong();
  }, [phase, answerCount, answers, soundOn]);

  // With instant reveal switched off, roll straight into the next question.
  useEffect(() => {
    if (phase !== "revealed" || !quiz || quiz.settings.revealAfterEach) return;
    const id = window.setTimeout(() => usePlaySession.getState().next(), 220);
    return () => window.clearTimeout(id);
  }, [phase, quiz]);

  // A question that ran out of time leaves the player nothing to decide, so the
  // answer is shown for a beat and the quiz keeps going on its own — through to
  // the results screen if that was the last question.
  const advancingAfterTimeout = quiz
    ? shouldAutoAdvanceAfterTimeout(quiz.settings, phase, answers[answers.length - 1])
    : false;
  const holdSeconds = quiz ? revealHoldSeconds(quiz.settings) : 5;

  useEffect(() => {
    if (!advancingAfterTimeout) return;
    const id = window.setTimeout(() => usePlaySession.getState().next(), holdSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [advancingAfterTimeout, holdSeconds]);

  const submitAnswer = useCallback(() => {
    const elapsed = limit !== null ? countdown.elapsedMs : Date.now() - startedAtRef.current;
    usePlaySession.getState().submit(elapsed);
  }, [countdown.elapsedMs, limit]);

  const handlePick = useCallback(
    (optionId: string) => {
      const state = usePlaySession.getState();
      if (state.phase !== "asking") return;

      state.toggle(optionId);
      if (soundOn) playSelect();

      // Single-answer questions lock in on click; multi-select waits for Submit.
      if (state.order[state.index]?.kind !== "multi-select") {
        const elapsed = limit !== null ? countdown.elapsedMs : Date.now() - startedAtRef.current;
        usePlaySession.getState().submit(elapsed);
      }
    },
    [countdown.elapsedMs, limit, soundOn],
  );

  const advance = useCallback(() => {
    if (soundOn) playWhoosh();
    usePlaySession.getState().next();
  }, [soundOn]);

  // Keyboard: number keys pick answers, Enter/Space moves on.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = usePlaySession.getState();
      const current = state.order[state.index];
      if (!current) return;

      if (state.phase === "asking") {
        const n = Number(event.key);
        if (n >= 1 && n <= current.options.length) {
          event.preventDefault();
          handlePick(current.options[n - 1].id);
        }
        if ((event.key === "Enter" || event.key === " ") && current.kind === "multi-select" && state.selected.length) {
          event.preventDefault();
          submitAnswer();
        }
      } else if (state.phase === "revealed") {
        if (event.key === "Enter" || event.key === " " || event.key === "ArrowRight") {
          event.preventDefault();
          advance();
        }
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handlePick, submitAnswer, advance]);

  if (!loaded) {
    return <Splash message="Loading quiz…" />;
  }

  if (missing || !quiz) {
    return (
      <Splash message="That quiz doesn't exist on this device.">
        <Link href="/">
          <Button variant="primary">Back to quizzes</Button>
        </Link>
      </Splash>
    );
  }

  if (!order.length) {
    return (
      <Splash message="This quiz has no questions yet.">
        <Link href={`/edit/${quiz.id}`}>
          <Button variant="primary">Open the builder</Button>
        </Link>
      </Splash>
    );
  }

  return (
    <ThemeShell theme={quiz.theme}>
      {phase === "intro" && (
        <div
          className={`mx-auto flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center ${
            mobile ? "max-w-[26rem]" : "max-w-2xl"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink-400">Solo run</p>
          <h1 className="stage-prompt text-4xl font-extrabold md:text-6xl">{quiz.title}</h1>
          {quiz.description && <p className="text-lg text-ink-300">{quiz.description}</p>}

          <div className="flex flex-wrap justify-center gap-2 text-sm text-ink-300">
            <Chip>{order.length} questions</Chip>
            <Chip>{quiz.settings.timerSeconds ? `${quiz.settings.timerSeconds}s per question` : "No timer"}</Chip>
            <Chip>{basePointsFor(quiz, order[0]).toLocaleString()} base points</Chip>
            {quiz.settings.speedBonus && <Chip>Speed bonus</Chip>}
            {quiz.settings.streakBonus && <Chip>Streak multiplier</Chip>}
          </div>

          {/* Last chance to change your mind without going back to the dashboard. */}
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span>Playing in</span>
            <ViewModeToggle value={view} onChange={chooseView} size="full" />
            <span>{mobile ? "mobile view" : "web view"}</span>
          </div>

          <Button variant="primary" size="lg" className="px-10" onClick={() => session.begin()}>
            Start quiz
          </Button>
          <Link href="/" className="text-sm text-ink-400 underline-offset-4 hover:underline">
            Back to all quizzes
          </Link>
        </div>
      )}

      {(phase === "asking" || phase === "revealed") && question && (
        <div className={`mx-auto flex min-h-dvh w-full flex-col justify-center px-5 py-8 ${stageWidth}`}>
          <QuestionStage
            question={question}
            index={index}
            total={order.length}
            selected={selected}
            revealed={phase === "revealed"}
            interactive={phase === "asking"}
            onPick={handlePick}
            mode="solo"
            narrow={mobile}
            header={
              <div className="flex items-center gap-5">
                <ScoreBadge score={score} streak={streak} compact />
                {limit !== null && (
                  <TimerRing
                    fraction={countdown.fraction}
                    secondsLeft={Math.ceil(countdown.remainingMs / 1000)}
                    urgent={countdown.urgent}
                    size={64}
                  />
                )}
              </div>
            }
          />

          <div className="mt-8 flex justify-center gap-3">
            {phase === "asking" && question.kind === "multi-select" && (
              <Button variant="primary" size="lg" disabled={!selected.length} onClick={submitAnswer}>
                Submit answer
              </Button>
            )}
            {phase === "revealed" && quiz.settings.revealAfterEach && (
              <Button variant="primary" size="lg" onClick={advance}>
                {index + 1 >= order.length ? "See results" : "Next question"} →
              </Button>
            )}
          </div>

          {advancingAfterTimeout ? (
            <AutoAdvanceBar
              key={question.id}
              seconds={holdSeconds}
              label={index + 1 >= order.length ? "results" : "next question"}
            />
          ) : (
            // Keyboard shortcuts are noise on a phone; touch wording is noise on a desktop.
            <p className="mt-4 text-center text-xs text-ink-500">
              {mobile
                ? phase === "asking"
                  ? "Tap an answer"
                  : "Tap to keep going"
                : phase === "asking"
                  ? `Press 1–${question.options.length} to answer`
                  : "Press Enter for the next question"}
            </p>
          )}
        </div>
      )}

      {phase === "results" && (
        <ResultsScreen
          quiz={quiz}
          order={order}
          answers={answers}
          score={score}
          bestStreak={bestStreak}
          narrow={mobile}
          onRetryAll={() => {
            session.start(quiz);
            session.begin();
          }}
          onRetryMissed={(ids) => {
            session.start(quiz, ids);
            session.begin();
          }}
        />
      )}
    </ThemeShell>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full border border-ink-600 bg-ink-900/60 px-3 py-1">{children}</span>;
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
