"use client";

import { useEffect, useState } from "react";

/**
 * Milliseconds since `runKey` became non-null, re-rendering on each animation
 * frame until `spanMs` has passed, then going quiet.
 *
 * This is only a clock. What a frame looks like is always decided by the pure
 * functions in lib/stageMotion and lib/reveal from the number returned here,
 * which is what lets the video exporter draw the same frames from `t` alone.
 *
 * - `null` while `runKey` is null (not started).
 * - `Infinity` when `instant` (reduced motion, static previews) or there is
 *   nothing to animate: every pure function clamps that to its final state.
 * - A new `runKey` restarts from 0 (replay buttons pass a counter).
 */
export function useElapsedSince(runKey: string | null, spanMs: number, instant = false): number | null {
  const [tick, setTick] = useState<{ key: string; ms: number } | null>(null);
  const animate = runKey !== null && !instant && spanMs > 0;

  useEffect(() => {
    if (!animate || runKey === null) return;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const ms = Math.max(0, now - start);
      setTick({ key: runKey, ms });
      if (ms < spanMs) frame = requestAnimationFrame(step);
    });
    return () => {
      cancelAnimationFrame(frame);
      setTick(null);
    };
  }, [animate, runKey, spanMs]);

  if (runKey === null) return null;
  if (!animate) return Number.POSITIVE_INFINITY;
  return tick?.key === runKey ? tick.ms : 0;
}
