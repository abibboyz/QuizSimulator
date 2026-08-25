"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import type { Cue, CueSlot } from "@/types/quiz";
import { getQuiz } from "@/lib/storage";
import { basePointsFor, timerFor, usePlaySession } from "@/lib/store/playSession";
import { useCountdown } from "@/hooks/useCountdown";
import { initSound, playCorrect, playSelect, playWhoosh, playWrong, primeSamples } from "@/lib/sound";
import { ThemeShell } from "@/components/ui/ThemeShell";
import { QuestionStage } from "@/components/play/QuestionStage";
import { ProgressMeter } from "@/components/play/ProgressMeter";
import { QuizProgress } from "@/components/play/QuizProgress";
import { ScoreBadge } from "@/components/play/ScoreBadge";
import { ResultsScreen } from "@/components/play/ResultsScreen";
import { AutoAdvanceBar } from "@/components/play/AutoAdvanceBar";
import { revealHoldSeconds, shouldAutoAdvanceAfterTimeout } from "@/lib/autoAdvance";
import { Button } from "@/components/ui/Button";
import { DEFAULT_THEME } from "@/lib/themes";
import { ViewModeToggle, VIEW_KEY, type ViewMode } from "@/components/ui/ViewModeToggle";
import { MuteButton } from "@/components/ui/MuteButton";
import { CuePlayer } from "@/components/play/CuePlayer";
import { activeCue } from "@/lib/cues";
import { useMuted } from "@/hooks/useMuted";
import { useReducedMotion } from "@/hooks/useReducedMotion";

// useSearchParams needs a Suspense boundary above it.
export default function PlayPage() {
  return (
    <Suspense fallback={<Splash message="Loading quiz…" />}>
      <PlayView />
    </Suspense>
  );
}

function PlayView() {
  const searchParams = useSearchParams();
  // The quiz id rides in the query string rather than the path so this route
  // can be a single static page — which is what lets it be precached and work
  // offline for every quiz, not just ones already visited online.
  const quizId = searchParams.get("quiz") ?? "";

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
        // Decode any uploaded cue sounds now: a celebration that lands 40ms
        // after the answer it belongs to reads as broken.
        primeSamples(
          [
            ...Object.values(found.settings.cues ?? {}),
            ...found.questions.flatMap((q) => Object.values(q.cues ?? {})),
          ].map((cue) => cue?.soundMedia),
        );
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
  // The author decides whether a quiz has sound; the player decides whether
  // this device does. Both have to agree before anything is audible.
  const muted = useMuted();
  const soundOn = (quiz?.settings.sound ?? false) && !muted;
  const reduced = useReducedMotion();

  // One cue plays at a time. Its slot is what tells `handleCueDone` whether the
  // run is waiting on it or it was pure decoration over a question.
  const [pending, setPending] = useState<{ cue: Cue; slot: CueSlot; token: number } | null>(null);
  const cueTokenRef = useRef(0);

  /*
   * The mirror is written synchronously inside showCue/clearCue rather than in
   * an effect. Syncing it after the commit left a window where the guard in
   * goNext still read the *previous* cue: two Enter presses in the same tick
   * both got through, and the second restarted the between cue that was already
   * running. Every caller here is an effect or an event handler, never render.
   */
  const pendingRef = useRef(pending);

  const showCue = useCallback((cue: Cue, slot: CueSlot) => {
    cueTokenRef.current += 1;
    const next = { cue, slot, token: cueTokenRef.current };
    pendingRef.current = next;
    setPending(next);
  }, []);

  const clearCue = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  const introCue = quiz ? activeCue(quiz, undefined, "intro") : null;
  const outroCue = quiz ? activeCue(quiz, undefined, "outro") : null;

  // A start cue holds the run in "countdown" until it reports back. The `ready`
  // fallback means a cue that somehow resolves to nothing can't strand a player
  // on a blank intro screen.
  useEffect(() => {
    if (phase !== "countdown") return;
    if (introCue) showCue(introCue, "intro");
    else usePlaySession.getState().ready();
  }, [phase, introCue, showCue]);

  const handleExpire = useCallback(() => {
    if (limit === null) return;
    usePlaySession.getState().submit(limit * 1000, true);
  }, [limit]);

  /*
   * A question is only "live" once nothing is covering it. Because a transition
   * cue now swaps the question at its midpoint, the next question exists behind
   * the overlay for the cue's second half — and it must not be on the clock, or
   * answerable through it, while the player still can't see it.
   */
  const stageLive = phase === "asking" && !pending;

  const countdown = useCountdown(
    stageLive,
    limit,
    soundOn,
    handleExpire,
    quiz?.settings.progressPulse === "heartbeat" ? "heartbeat" : "beep",
  );

  // Mark the wall-clock start of each question so untimed play can still record
  // how long an answer took.
  useEffect(() => {
    if (stageLive) startedAtRef.current = Date.now();
  }, [stageLive, index]);

  // Reveal feedback: fires once per scored answer. A cue, when the author set
  // one, replaces the stock chime entirely — it carries its own sound.
  const answerCount = answers.length;
  const justCorrect = phase === "revealed" && answers[answerCount - 1]?.correct === true;
  const revealFiredRef = useRef(0);
  useEffect(() => {
    if (phase !== "revealed" || !answerCount || !quiz) return;
    // Pinned to the answer, not to the effect's dependencies: `soundOn` is in
    // there, so hitting mute mid-cue used to re-enter here and restart the
    // celebration. A restarted run counts back from zero, so a stale value can
    // never match and block a legitimate fire.
    if (revealFiredRef.current === answerCount) return;
    revealFiredRef.current = answerCount;

    const correct = answers[answerCount - 1].correct;
    // With reveal-off the run only pauses here for 220ms before rolling on, so
    // a cue would flash a fraction of itself and get yanked. That setting means
    // "no feedback until the results screen" — a celebration is exactly the
    // feedback it is switched off to avoid.
    const cue = quiz.settings.revealAfterEach ? activeCue(quiz, order[index], correct ? "correct" : "wrong") : null;
    if (cue) {
      showCue(cue, correct ? "correct" : "wrong");
      return;
    }

    if (!soundOn) return;
    if (correct) playCorrect();
    else playWrong();
  }, [phase, answerCount, answers, soundOn, quiz, order, index, showCue]);

  /**
   * The single way a question ends. Every path — the button, the keyboard, the
   * reveal-off timer, the timeout bar — comes through here, so a "between" cue
   * can hold the run for its duration without any one of them skipping it.
   */
  const goNext = useCallback(
    (manual: boolean) => {
      const state = usePlaySession.getState();
      if (state.phase !== "revealed" || !quiz) return;
      // Already holding for a cue; a second Enter shouldn't restart it.
      if (pendingRef.current?.slot === "between") return;

      // Nothing to transition into after the last question, and running one
      // anyway would drop the results screen — and its outro cue — underneath a
      // still-playing overlay. The stock whoosh below still sees it off.
      const isLast = state.index + 1 >= state.order.length;
      const between = isLast ? null : activeCue(quiz, state.order[state.index], "between");
      if (between) {
        showCue(between, "between");
        return;
      }

      // The stock whoosh stands in for an unset cue, but only on the path where
      // it always played — the automatic ones were deliberately silent.
      if (manual && soundOn) playWhoosh();
      // Drops a reveal cue still running from the question being left behind —
      // a long cue against a short auto-advance hold would otherwise sit over
      // the next question for the rest of its duration.
      clearCue();
      state.next();
    },
    [quiz, soundOn, showCue, clearCue],
  );

  // The auto-advance timers are armed by effects that must not re-run when
  // goNext's identity changes, or their countdown would restart. They only read
  // this from inside a setTimeout, long after the sync below has run.
  const goNextRef = useRef(goNext);

  useEffect(() => {
    goNextRef.current = goNext;
  }, [goNext]);

  const advance = useCallback(() => goNext(true), [goNext]);

  /**
   * A transition cue swaps the question halfway through rather than at the end,
   * so it spans the change instead of playing out entirely over the question
   * being left behind. The second half lands over the question arriving.
   */
  const handleCueMidpoint = useCallback(() => {
    if (pendingRef.current?.slot !== "between") return;
    usePlaySession.getState().next();
  }, []);

  const handleCueDone = useCallback(() => {
    const finished = pendingRef.current;
    clearCue();
    if (!finished) return;
    if (finished.slot === "intro") usePlaySession.getState().ready();
    // "between" already advanced at its midpoint.
  }, [clearCue]);

  // With instant reveal switched off, roll straight into the next question.
  useEffect(() => {
    if (phase !== "revealed" || !quiz || quiz.settings.revealAfterEach) return;
    const id = window.setTimeout(() => goNextRef.current(false), 220);
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
    const id = window.setTimeout(() => goNextRef.current(false), holdSeconds * 1000);
    return () => window.clearTimeout(id);
  }, [advancingAfterTimeout, holdSeconds]);

  const submitAnswer = useCallback(() => {
    const elapsed = limit !== null ? countdown.elapsedMs : Date.now() - startedAtRef.current;
    usePlaySession.getState().submit(elapsed);
  }, [countdown.elapsedMs, limit]);

  const handlePick = useCallback(
    (optionId: string) => {
      const state = usePlaySession.getState();
      if (state.phase !== "asking" || pendingRef.current) return;

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

  // Keyboard: number keys pick answers, Enter/Space moves on.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const state = usePlaySession.getState();
      const current = state.order[state.index];
      if (!current) return;

      if (state.phase === "asking") {
        if (pendingRef.current) return;
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
        <Link href={`/edit?quiz=${quiz.id}`}>
          <Button variant="primary">Open the builder</Button>
        </Link>
      </Splash>
    );
  }

  return (
    <ThemeShell theme={quiz.theme}>
      {/* The intro stays put behind a start cue, so the screen is never blank
          while one plays. */}
      {(phase === "intro" || phase === "countdown") && (
        <div
          className={`mx-auto flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center ${
            mobile ? "max-w-[26rem]" : "max-w-2xl"
          }`}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-ink-400">Solo run</p>
          <h1 className="stage-prompt text-4xl font-extrabold md:text-6xl" style={{ color: "var(--title-color)" }}>
            {quiz.title}
          </h1>
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
            <MuteButton />
          </div>

          <Button
            variant="primary"
            size="lg"
            className="px-10"
            disabled={phase === "countdown"}
            onClick={() => session.begin(!!introCue)}
          >
            Start quiz
          </Button>
          <Link href="/" className="text-sm text-ink-400 underline-offset-4 hover:underline">
            Back to all quizzes
          </Link>
        </div>
      )}

      {(phase === "asking" || phase === "revealed") && question && (
        <div className={`mx-auto flex min-h-dvh w-full flex-col justify-center px-5 py-8 ${stageWidth}`}>
          {/* Outside AnimatePresence: the run's progress shouldn't slide away
              with the question it was measuring. */}
          <QuizProgress
            index={index}
            total={order.length}
            outcomes={quiz.settings.revealAfterEach ? answers.map((a) => a.correct) : undefined}
            style={quiz.settings.quizProgressStyle}
            mascot={quiz.settings.progressMascot}
            mascotMedia={quiz.settings.progressMascotMedia}
            narrow={mobile}
          />

          {/* Keyed by question so each one genuinely mounts — without this React
              reuses the DOM across questions and no entrance can fire. */}
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={question.id}
              initial={reduced ? false : { opacity: 0, x: 36 }}
              animate={reduced ? {} : { opacity: 1, x: 0 }}
              exit={reduced ? {} : { opacity: 0, x: -36 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.3, 1] }}
            >
              <QuestionStage
                question={question}
                index={index}
                total={order.length}
                selected={selected}
                revealed={phase === "revealed"}
                interactive={stageLive}
                onPick={handlePick}
                mode="solo"
                narrow={mobile}
                theme={quiz.theme}
                header={
                  <div className="flex items-center gap-4">
                    <ScoreBadge score={score} streak={streak} compact />
                    <MuteButton />
                    {limit !== null && (
                      <ProgressMeter
                        fraction={countdown.fraction}
                        secondsLeft={Math.ceil(countdown.remainingMs / 1000)}
                        urgent={countdown.urgent}
                        style={quiz.settings.progressStyle}
                        pulse={quiz.settings.progressPulse}
                        mascot={quiz.settings.progressMascot}
                        mascotMedia={quiz.settings.progressMascotMedia}
                        celebrate={justCorrect}
                        size={64}
                      />
                    )}
                  </div>
                }
              />
            </motion.div>
          </AnimatePresence>

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
          soundOn={soundOn}
          outroCue={outroCue}
          onRetryAll={() => {
            session.start(quiz);
            session.begin(!!introCue);
          }}
          onRetryMissed={(ids) => {
            session.start(quiz, ids);
            session.begin(!!introCue);
          }}
        />
      )}

      {/* Remounted per cue so a new one can't inherit the previous hold timer. */}
      {pending && (
        <CuePlayer
          key={pending.token}
          cue={pending.cue}
          onDone={handleCueDone}
          onMidpoint={handleCueMidpoint}
          soundOn={soundOn}
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
