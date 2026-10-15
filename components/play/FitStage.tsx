"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { fitStage } from "@/lib/fitStage";

/** Keep real, interactive DOM content visible inside a bounded stage. */
export function FitStage({ children, width = 1280, minHeight = 720, className = "", disabled = false }: {
  children: ReactNode;
  width?: number;
  minHeight?: number;
  className?: string;
  disabled?: boolean;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (disabled) return;
    const viewport = viewportRef.current;
    const content = contentRef.current;
    if (!viewport || !content) return;
    const fit = () => {
      const height = Math.max(minHeight, content.scrollHeight, content.offsetHeight);
      const scale = fitStage(viewport.clientWidth, viewport.clientHeight, width, height);
      content.style.transform = `translate(-50%, -50%) scale(${scale})`;
      content.style.visibility = scale > 0 ? "visible" : "hidden";
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(viewport);
    observer.observe(content);
    return () => observer.disconnect();
  }, [disabled, width, minHeight]);

  if (disabled) return <>{children}</>;
  return (
    <div ref={viewportRef} className={`relative min-h-0 min-w-0 overflow-hidden ${className}`} data-fit-stage>
      <div ref={contentRef} className="absolute left-1/2 top-1/2 flow-root" style={{ width, minHeight, transformOrigin: "center", visibility: "hidden" }}>
        {children}
      </div>
    </div>
  );
}
