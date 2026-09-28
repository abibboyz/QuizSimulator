"use client";

import { useEffect, useRef, useState } from "react";
import { playHeartbeat, playTick, playUrgentTick } from "@/lib/sound";
import { timerTickKind } from "@/lib/playTiming";
import { countdownView, elapsedFor, type CountdownClock } from "@/lib/countdown";

type Result = ReturnType<typeof countdownView>;

/**
 * Drives the question timer off requestAnimationFrame rather than setInterval,
 * so the ring animates smoothly and drift can't accumulate across a long quiz.
 * `onExpire` fires exactly once per run.
 *
 * When `active` goes false the elapsed value is left where it stopped, which is
 * what freezes the ring at the moment an answer was locked in.
 */
export function useCountdown(
  active: boolean,
  seconds: number | null,
  soundOn: boolean,
  onExpire: () => void,
  /** Matches the tick to the meter's pulse, so a heartbeat meter sounds like one. */
  tick: "beep" | "heartbeat" = "beep",
  /**
   * Identifies the question being timed. The frozen value from an earlier key
   * reads as a full timer, so a new question never shows the last one's time
   * while it waits (behind a between cue) for its clock to start.
   */
  runKey: string | number | null = null,
): Result {
  const [clock, setClock] = useState<CountdownClock>({ key: runKey, elapsedMs: 0 });
  const elapsedMs = elapsedFor(clock, runKey);
  const expireRef = useRef(onExpire);
  const firedRef = useRef(false);
  const lastTickRef = useRef(-1);
  // Held in a ref for the same reason as onExpire, but the stakes are higher:
  // as an effect dependency it would restart the loop mid-question, and the
  // body re-reads performance.now() — so muting would hand back a full timer.
  const soundRef = useRef(soundOn);
  const tickRef = useRef(tick);

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  // Out of the deps for the same reason as soundOn: changing it must not
  // restart the clock mid-question.
  useEffect(() => {
    tickRef.current = tick;
  }, [tick]);

  useEffect(() => {
    if (!active || seconds === null) {
      firedRef.current = false;
      lastTickRef.current = -1;
      return;
    }

    const limit = seconds * 1000;
    const startedAt = performance.now();
    let frame = 0;
    firedRef.current = false;
    lastTickRef.current = -1;

    const step = (now: number) => {
      const elapsed = now - startedAt;
      setClock({ key: runKey, elapsedMs: elapsed });

      // One tick per whole second remaining, urgent in the last quarter.
      const secondsLeft = Math.ceil((limit - elapsed) / 1000);
      if (soundRef.current && secondsLeft !== lastTickRef.current && secondsLeft >= 0) {
        lastTickRef.current = secondsLeft;
        const heart = tickRef.current === "heartbeat";
        const kind = timerTickKind(elapsed, limit, secondsLeft);
        if (kind === "urgent") {
          if (heart) playHeartbeat();
          else playUrgentTick();
        } else if (kind === "tick") {
          if (heart) playHeartbeat();
          else playTick();
        }
      }

      if (elapsed >= limit) {
        if (!firedRef.current) {
          firedRef.current = true;
          expireRef.current();
        }
        return;
      }
      frame = requestAnimationFrame(step);
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [active, seconds, runKey]);

  return countdownView(seconds, elapsedMs);
}
