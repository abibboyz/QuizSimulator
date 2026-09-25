"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { SCORE_TWEEN_MS } from "@/lib/playTiming";

/** Tweens to a new value so scores climb instead of jumping. */
export function useAnimatedNumber(value: number, durationMs = SCORE_TWEEN_MS): number {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const reduced = useReducedMotion();
  const animate = !reduced && durationMs > 0;

  useEffect(() => {
    if (!animate) {
      fromRef.current = value;
      return;
    }

    const from = fromRef.current;
    if (from === value) return;

    const startedAt = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      // Ease-out cubic: fast off the line, gentle landing.
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (value - from) * eased));

      if (t < 1) {
        frame = requestAnimationFrame(step);
      } else {
        fromRef.current = value;
      }
    };

    frame = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(frame);
      fromRef.current = value;
    };
  }, [value, durationMs, animate]);

  return animate ? display : value;
}
