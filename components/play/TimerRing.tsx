"use client";

interface Props {
  /** 1 = full time remaining, 0 = expired. */
  fraction: number;
  secondsLeft: number;
  urgent: boolean;
  size?: number;
}

export function TimerRing({ fraction, secondsLeft, urgent, size = 88 }: Props) {
  const stroke = size * 0.09;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      className={`relative shrink-0 ${urgent ? "animate-urgent" : ""}`}
      style={{ width: size, height: size }}
      role="timer"
      aria-live="off"
      aria-label={`${secondsLeft} seconds remaining`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.12)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={urgent ? "var(--color-bad)" : "var(--accent)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          style={{ transition: "stroke 0.3s ease" }}
        />
      </svg>
      <div
        className="absolute inset-0 grid place-items-center font-bold tabular-nums"
        style={{ fontSize: size * 0.32, color: urgent ? "var(--color-bad)" : "var(--color-ink-100)" }}
      >
        {secondsLeft}
      </div>
    </div>
  );
}
