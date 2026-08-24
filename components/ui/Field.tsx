"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";

const BASE =
  "focus-ring w-full rounded-xl border border-ink-600 bg-ink-900/70 px-3 py-2 text-sm text-ink-100 placeholder:text-ink-500 transition focus:border-ink-500";

export function Field({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  /** Control shown on the label row, e.g. a colour swatch for this field's text. */
  action?: ReactNode;
  children: ReactNode;
}) {
  const labelText = <span className="text-xs font-semibold uppercase tracking-widest text-ink-400">{label}</span>;
  const hintText = hint && <span className="mt-1 block text-xs text-ink-500">{hint}</span>;

  // With an action, the wrapper can't be a <label> — that would put a second
  // interactive control inside it and clicking the swatch would also focus the
  // input. Callers passing an action give their control its own aria-label.
  if (action) {
    return (
      <div className="block">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          {labelText}
          {action}
        </div>
        {children}
        {hintText}
      </div>
    );
  }

  return (
    <label className="block">
      <span className="mb-1.5 block">{labelText}</span>
      {children}
      {hintText}
    </label>
  );
}

export function Input({ className = "", ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...rest} className={`${BASE} ${className}`} />;
}

export function Textarea({ className = "", ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...rest} className={`${BASE} resize-y ${className}`} />;
}

export function Select({ className = "", children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...rest} className={`${BASE} cursor-pointer ${className}`}>
      {children}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="focus-ring flex w-full items-center justify-between gap-4 rounded-xl border border-ink-700 bg-ink-900/50 px-3 py-2.5 text-left transition hover:border-ink-600"
    >
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-100">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-500">{hint}</span>}
      </span>
      <span
        aria-hidden
        className="relative h-6 w-11 shrink-0 rounded-full transition"
        style={{ background: checked ? "var(--accent)" : "var(--color-ink-700)" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all"
          style={{ left: checked ? "1.375rem" : "0.125rem" }}
        />
      </span>
    </button>
  );
}
