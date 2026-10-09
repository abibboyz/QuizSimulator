"use client";

import { useEffect, useState } from "react";
import { autoAdvanceMessage } from "@/lib/autoAdvance";
import type { AutoAdvanceBarStyle } from "@/types/quiz";

interface Props {
  seconds: number;
  /** What happens when the countdown ends, e.g. "next question". */
  label: string;
  message?: string;
  styleName?: AutoAdvanceBarStyle;
  color?: string;
  trackColor?: string;
}

/**
 * Counts down to an automatic advance. Mounted only while an advance is
 * pending, so the initial value comes straight from useState and there's no
 * state to reset when the question changes.
 */
export function AutoAdvanceBar({ seconds, label, message, styleName = "line", color, trackColor }: Props) {
  const total = Math.max(1, seconds);
  const [left, setLeft] = useState(total);
  const fill = color ?? "var(--accent)";
  const track = trackColor ?? "var(--color-ink-800)";

  useEffect(() => {
    const id = window.setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mx-auto mt-4 w-full max-w-xs text-center">
      <p className="text-xs font-semibold text-ink-400">{autoAdvanceMessage(message, label, left)}</p>
      {/* The bar is CSS-driven so it stays smooth without a second JS timer. */}
      {styleName === "dots" ? (
        <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
          {Array.from({ length: Math.min(12, total) }, (_, index) => {
            const lit = index < Math.ceil((left / total) * Math.min(12, total));
            return <span key={index} className="h-2 w-2 rounded-full transition-colors" style={{ background: lit ? fill : track }} />;
          })}
        </div>
      ) : (
        <div className={`mt-2 w-full overflow-hidden rounded-full ${styleName === "pill" ? "h-2" : "h-0.5"}`} style={{ background: track }}>
          <div className="h-full" style={{ background: fill, animation: `drain ${total}s linear forwards` }} />
        </div>
      )}
    </div>
  );
}
