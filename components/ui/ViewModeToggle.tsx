"use client";

export type ViewMode = "web" | "mobile";

export const VIEW_KEY = "quizsim:view";

interface Props {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  /** Compact sits beside a Play button; full is for the intro screen. */
  size?: "compact" | "full";
}

/**
 * Picks the shape of the play surface before a quiz starts. Two options only,
 * so a segmented control beats a dropdown — one click instead of two, and both
 * choices stay visible.
 */
export function ViewModeToggle({ value, onChange, size = "compact" }: Props) {
  const compact = size === "compact";

  return (
    <div
      role="radiogroup"
      aria-label="Play view"
      className={`inline-flex shrink-0 items-center gap-0.5 rounded-xl border border-ink-700 bg-ink-900/60 ${compact ? "p-0.5" : "p-1"}`}
    >
      <Choice
        active={value === "web"}
        compact={compact}
        label="Web view"
        onClick={() => onChange("web")}
        icon={
          <>
            <rect x="2" y="3" width="16" height="11" rx="1.6" />
            <path d="M7 17.5h6M10 14.5v3" />
          </>
        }
      />
      <Choice
        active={value === "mobile"}
        compact={compact}
        label="Mobile view"
        onClick={() => onChange("mobile")}
        icon={
          <>
            <rect x="6" y="2" width="8" height="16" rx="2" />
            <path d="M9 15.4h2" />
          </>
        }
      />
    </div>
  );
}

function Choice({
  active,
  compact,
  label,
  onClick,
  icon,
}: {
  active: boolean;
  compact: boolean;
  label: string;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`focus-ring grid place-items-center rounded-lg transition ${compact ? "h-7 w-7" : "h-9 w-11"} ${
        active ? "text-ink-950" : "text-ink-400 hover:text-ink-200"
      }`}
      style={active ? { background: "var(--accent)" } : undefined}
    >
      <svg
        width={compact ? 15 : 18}
        height={compact ? 15 : 18}
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {icon}
      </svg>
    </button>
  );
}
