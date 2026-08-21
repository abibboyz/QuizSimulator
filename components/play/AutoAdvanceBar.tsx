"use client";

import { useEffect, useState } from "react";

interface Props {
  seconds: number;
  /** What happens when the countdown ends, e.g. "next question". */
  label: string;
}

/**
 * Counts down to an automatic advance. Mounted only while an advance is
 * pending, so the initial value comes straight from useState and there's no
 * state to reset when the question changes.
 */
export function AutoAdvanceBar({ seconds, label }: Props) {
  const total = Math.max(1, seconds);
  const [left, setLeft] = useState(total);

  useEffect(() => {
    const id = window.setInterval(() => setLeft((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mx-auto mt-4 w-full max-w-xs text-center">
      <p className="text-xs font-semibold text-ink-400">
        Out of time — {label} in{" "}
        <span className="tabular-nums" style={{ color: "var(--accent)" }}>
          {left}s
        </span>
      </p>
      {/* The bar is CSS-driven so it stays smooth without a second JS timer. */}
      <div className="mt-2 h-0.5 w-full overflow-hidden rounded-full bg-ink-800">
        <div className="h-full" style={{ background: "var(--accent)", animation: `drain ${total}s linear forwards` }} />
      </div>
    </div>
  );
}
