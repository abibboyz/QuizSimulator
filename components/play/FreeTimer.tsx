"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { clampTimerOrigin } from "@/lib/timerPlacement";

interface Props {
  /** Top-left of the timer, as a percent of the stage. */
  x: number;
  y: number;
  children: ReactNode;
}

/**
 * Pins the question timer to a saved spot on the stage.
 *
 * Used only after the timer has been dragged. The default header layout does
 * not render this, so an undragged quiz stays exactly as it was.
 */
export function FreeTimer({ x, y, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [origin, setOrigin] = useState({ x, y });

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.offsetParent instanceof HTMLElement ? el.offsetParent : null;
    if (!el || !parent) return;
    const apply = () => {
      const next = clampTimerOrigin(x, y, el.offsetWidth, el.offsetHeight, parent.clientWidth, parent.clientHeight);
      setOrigin((prev) => (prev.x === next.x && prev.y === next.y ? prev : next));
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(el);
    observer.observe(parent);
    return () => observer.disconnect();
  }, [x, y]);

  return (
    <div ref={ref} className="pointer-events-none absolute z-20" style={{ left: `${origin.x}%`, top: `${origin.y}%` }}>
      {children}
    </div>
  );
}
