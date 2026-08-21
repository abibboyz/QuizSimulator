"use client";

import { useEffect, useRef, useState } from "react";
import { playTick, playUrgentTick } from "@/lib/sound";

interface Result {
  elapsedMs: number;
  remainingMs: number;
  /** 1 at the start, 0 when time is up. `1` for untimed questions. */
  fraction: number;
  urgent: boolean;
}

/**
 * Drives the question timer off requestAnimationFrame rather than setInterval,
 * so the ring animates smoothly and drift can't accumulate across a long quiz.
 * `onExpire` fires exactly once per run.
 *
 * When `active` goes false the elapsed value is left where it stopped, which is
 * what freezes the ring at the moment an answer was locked in.
 */
export function useCountdown(active: boolean, seconds: number | null, soundOn: boolean, onExpire: () => void): Result {
  const [elapsedMs, setElapsedMs] = useState(0);
  const expireRef = useRef(onExpire);
  const firedRef = useRef(false);
  const lastTickRef = useRef(-1);

  useEffect(() => {
    expireRef.current = onExpire;
  }, [onExpire]);

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
      setElapsedMs(elapsed);

      // One tick per whole second remaining, urgent in the last quarter.
      const secondsLeft = Math.ceil((limit - elapsed) / 1000);
      if (soundOn && secondsLeft !== lastTickRef.current && secondsLeft >= 0) {
        lastTickRef.current = secondsLeft;
        if (elapsed / limit > 0.75) playUrgentTick();
        else if (secondsLeft <= 10) playTick();
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
  }, [active, seconds, soundOn]);

  if (seconds === null) {
    return { elapsedMs, remainingMs: 0, fraction: 1, urgent: false };
  }

  const limit = seconds * 1000;
  const remainingMs = Math.max(0, limit - elapsedMs);
  const fraction = Math.max(0, Math.min(1, remainingMs / limit));

  return { elapsedMs, remainingMs, fraction, urgent: fraction <= 0.25 };
}
