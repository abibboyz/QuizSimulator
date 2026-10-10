"use client";

import { useEffect, useRef, useState } from "react";
import { optionPalette } from "@/lib/ageBands";
import type { AgeBand } from "@/types/quiz";

/** Quick picks: the theme's own answer palette, then a few bright / neutral extras. */
export function answerSwatches(band?: AgeBand): string[] {
  return [...optionPalette(band).map((slot) => slot.bg), "#ffffff", "#ffd23f", "#ff5fa2", "#38bdf8", "#7c3aed", "#111827"];
}

interface Props {
  /** Names the control, e.g. "Colour for answer 2". */
  label: string;
  /** The answer's own colour; undefined = follow the theme / default. */
  value: string | undefined;
  /** What it renders as while unset. */
  fallback: string;
  /** Theme-friendly quick picks (the answer palette, accent, reveal-safe neutrals). */
  swatches: string[];
  onChange: (value: string | undefined) => void;
}

/**
 * Per-answer colour: a chip that opens a small palette with quick swatches,
 * a custom colour picker and "Reset to default". Unset is a real state — the
 * answer keeps following the theme, so old quizzes look exactly as before.
 */
export function AnswerColorPicker({ label, value, fallback, swatches, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const esc = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const unique = Array.from(new Set(swatches.map((c) => c.toLowerCase())));
  const current = (value ?? fallback).toLowerCase();

  return (
    <span ref={root} className="relative inline-flex shrink-0" onPointerDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={value === undefined ? `${label} — following the theme` : `${label} — ${value}`}
        onClick={() => setOpen((v) => !v)}
        className={`focus-ring h-6 w-6 rounded-md border ${value === undefined ? "border-dashed border-ink-500 opacity-70" : "border-ink-300"}`}
        style={{ background: value ?? fallback }}
      />
      {open && (
        <span role="dialog" aria-label={label} className="absolute right-0 top-7 z-30 w-44 space-y-2 rounded-xl border border-ink-700 bg-ink-900 p-2 shadow-xl">
          <span className="grid grid-cols-6 gap-1">
            {unique.map((color) => (
              <button
                key={color}
                type="button"
                aria-label={`Use ${color}`}
                aria-pressed={value !== undefined && current === color}
                onClick={() => {
                  onChange(color);
                  setOpen(false);
                }}
                className={`focus-ring h-5 w-5 rounded ${value !== undefined && current === color ? "ring-2 ring-white" : "border border-ink-700"}`}
                style={{ background: color }}
              />
            ))}
          </span>
          <label className="flex items-center justify-between gap-2 text-[11px] text-ink-300">
            Custom
            <input type="color" aria-label={`${label} — custom`} value={value ?? fallback} onChange={(event) => onChange(event.target.value)} className="h-5 w-8 cursor-pointer rounded border border-ink-600 bg-transparent p-0" />
          </label>
          <button
            type="button"
            disabled={value === undefined}
            onClick={() => {
              onChange(undefined);
              setOpen(false);
            }}
            className="focus-ring w-full rounded-lg border border-ink-700 px-2 py-1 text-[11px] font-semibold text-ink-200 hover:bg-ink-800 disabled:opacity-40"
          >
            Reset to default
          </button>
        </span>
      )}
    </span>
  );
}
