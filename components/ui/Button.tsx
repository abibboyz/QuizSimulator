"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "ghost" | "outline" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

const VARIANTS: Record<Variant, string> = {
  primary: "text-ink-950 shadow-lg hover:brightness-110",
  ghost: "text-ink-200 hover:bg-ink-800 hover:text-ink-100",
  outline: "border border-ink-600 text-ink-200 hover:border-ink-500 hover:bg-ink-800",
  danger: "border border-bad/40 text-bad hover:bg-bad/10",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export function Button({ variant = "ghost", size = "md", className = "", children, ...rest }: Props) {
  return (
    <button
      {...rest}
      className={`focus-ring inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-semibold transition disabled:cursor-not-allowed disabled:opacity-40 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      style={variant === "primary" ? { background: "var(--accent)", ...rest.style } : rest.style}
    >
      {children}
    </button>
  );
}
