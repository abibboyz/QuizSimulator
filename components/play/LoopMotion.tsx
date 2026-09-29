"use client";

import { useEffect, useRef, type ReactNode } from "react";
import type { LoopMotion as Settings } from "@/types/quiz";
import { loopOrigin, loopTransform, normalizeLoop } from "@/lib/loopMotion";
import { useReducedMotion } from "@/hooks/useReducedMotion";

/** Separate transform layer preserves entrance/exit animations and a stable hover target. */
export function LoopMotion({ value, stopped = false, preview = false, index = 0, children }: {
  value: Settings; stopped?: boolean; preview?: boolean; index?: number; children: ReactNode;
}) {
  const node = useRef<HTMLDivElement>(null);
  const animation = useRef<Animation | null>(null);
  const held = useRef(false);
  const reduced = useReducedMotion();
  const { style, durationMs, amount, secondary, direction, playback, pauseOnInteract } = normalizeLoop(value);
  useEffect(() => {
    if (!node.current || reduced || stopped || style === "none" || amount === 0) return;
    const settings = { style, secondary, direction, playback, durationMs, amount: preview ? amount * 0.4 : amount };
    const frames = Array.from({ length: 81 }, (_, i) => ({ transform: loopTransform(settings, durationMs * i / 80, index), offset: i / 80 }));
    const active = node.current.animate(frames, { duration: durationMs, iterations: playback === "hold" ? 1 : Infinity, fill: "forwards", easing: "linear" });
    animation.current = active;
    if (pauseOnInteract && held.current) active.pause();
    return () => { active.cancel(); animation.current = null; };
  }, [style, secondary, direction, playback, durationMs, amount, preview, reduced, stopped, index, pauseOnInteract]);
  if (reduced || stopped || style === "none" || amount === 0) return <>{children}</>;

  return <div className="min-w-0 h-full" onPointerEnter={() => { held.current = true; if (pauseOnInteract) animation.current?.pause(); }}
    onPointerLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) { held.current = false; if (animation.current?.playState === "paused") animation.current.play(); } }}
    onFocusCapture={() => { held.current = true; if (pauseOnInteract) animation.current?.pause(); }}
    onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) { held.current = false; if (animation.current?.playState === "paused") animation.current.play(); } }}>
    <div ref={node} className="h-full" style={{ transformOrigin: loopOrigin(value) }}>{children}</div>
  </div>;
}
