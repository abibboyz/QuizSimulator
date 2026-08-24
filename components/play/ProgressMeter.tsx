"use client";

import type { MediaRef, ProgressPulse, ProgressStyle } from "@/types/quiz";
import { litSteps, METER_STEPS, pulseMs, PULSE_CLASS } from "@/lib/progress";
import { TimerRing } from "@/components/play/TimerRing";
import { MascotFigure } from "@/components/play/MascotFigure";

interface Props {
  /** 1 = full time remaining, 0 = expired. */
  fraction: number;
  secondsLeft: number;
  urgent: boolean;
  style: ProgressStyle;
  pulse: ProgressPulse;
  mascot?: string;
  mascotMedia?: MediaRef;
  /** The mascot celebrates instead of walking — a correct answer just landed. */
  celebrate?: boolean;
  /** Base measurement: the ring's diameter, and what the wide meters scale off. */
  size?: number;
}

/**
 * The question timer, in whichever shape the quiz asked for.
 *
 * One component rather than a branch at each call site, so solo play, host
 * mode, and the builder preview can never drift apart. `ring` delegates to the
 * original TimerRing — the default has to stay pixel-identical to what quizzes
 * built before this existed already look like.
 */
export function ProgressMeter({
  fraction,
  secondsLeft,
  urgent,
  style,
  pulse,
  mascot,
  mascotMedia,
  celebrate = false,
  size = 64,
}: Props) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const tint = urgent ? "var(--color-bad)" : "var(--accent)";

  // The pulse period is recomputed every frame the timer ticks, so the beat
  // accelerates smoothly rather than switching gear at a threshold.
  const wrapper = {
    className: PULSE_CLASS[pulse],
    style: { "--pulse-ms": `${pulseMs(clamped)}ms` } as React.CSSProperties,
  };

  const label = `${secondsLeft} seconds remaining`;
  const common = { role: "timer" as const, "aria-live": "off" as const, "aria-label": label };

  if (style === "ring") {
    return (
      <div {...wrapper}>
        <TimerRing fraction={fraction} secondsLeft={secondsLeft} urgent={urgent} size={size} />
      </div>
    );
  }

  const count = (
    <span className="shrink-0 font-bold tabular-nums" style={{ fontSize: size * 0.34, color: tint }}>
      {secondsLeft}
    </span>
  );

  if (style === "bar") {
    return (
      <div {...common} {...wrapper} className={`flex shrink-0 items-center gap-2 ${wrapper.className}`}>
        {count}
        <div
          className="overflow-hidden rounded-full bg-white/12"
          style={{ width: size * 2.4, height: Math.max(6, size * 0.14) }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-100 ease-linear"
            style={{ width: `${clamped * 100}%`, background: tint }}
          />
        </div>
      </div>
    );
  }

  if (style === "pill") {
    return (
      <div
        {...common}
        {...wrapper}
        className={`relative shrink-0 overflow-hidden rounded-full bg-white/12 ${wrapper.className}`}
        style={{ ...wrapper.style, width: size * 1.7, height: size * 0.62 }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear"
          style={{ width: `${clamped * 100}%`, background: tint, opacity: 0.35 }}
        />
        <span
          className="absolute inset-0 grid place-items-center font-bold tabular-nums"
          style={{ fontSize: size * 0.34, color: tint }}
        >
          {secondsLeft}
        </span>
      </div>
    );
  }

  if (style === "segments" || style === "dots") {
    const lit = litSteps(clamped);
    const dot = style === "dots";
    return (
      <div {...common} {...wrapper} className={`flex shrink-0 items-center gap-2 ${wrapper.className}`}>
        {count}
        <div className="flex items-center" style={{ gap: Math.max(2, size * 0.05) }}>
          {Array.from({ length: METER_STEPS }, (_, i) => (
            <span
              key={i}
              className={`transition-opacity duration-150 ${dot ? "rounded-full" : "rounded-sm"}`}
              style={{
                width: dot ? size * 0.15 : size * 0.11,
                height: dot ? size * 0.15 : size * 0.34,
                background: i < lit ? tint : "rgba(255,255,255,0.14)",
                opacity: i < lit ? 1 : 0.6,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <MascotMeter
      {...common}
      wrapper={wrapper}
      fraction={clamped}
      secondsLeft={secondsLeft}
      tint={tint}
      mascot={mascot}
      media={mascotMedia}
      celebrate={celebrate}
      size={size}
    />
  );
}

interface MascotProps {
  wrapper: { className: string; style: React.CSSProperties };
  fraction: number;
  secondsLeft: number;
  tint: string;
  mascot?: string;
  media?: MediaRef;
  celebrate: boolean;
  size: number;
  role: "timer";
  "aria-live": "off";
  "aria-label": string;
}

/**
 * A character racing the clock. It starts at the line and walks to the flag as
 * the time drains, so position reads as "how long is left" without a number —
 * and its stride quickens with the pulse period for the same reason.
 */
function MascotMeter({ wrapper, fraction, secondsLeft, tint, mascot, media, celebrate, size, ...rest }: MascotProps) {
  const track = size * 2.4;
  const glyph = size * 0.5;

  // Kept inside the track so the character never hangs off either end.
  const travel = (1 - fraction) * 100;

  return (
    <div {...rest} className={`flex shrink-0 items-center gap-2 ${wrapper.className}`} style={wrapper.style}>
      <span className="font-bold tabular-nums" style={{ fontSize: size * 0.3, color: tint }}>
        {secondsLeft}
      </span>

      <div className="relative" style={{ width: track, height: glyph * 1.5 }}>
        <div
          className="absolute inset-x-0 bottom-0 rounded-full"
          style={{ height: Math.max(2, size * 0.04), background: "rgba(255,255,255,0.16)" }}
        />
        <span
          aria-hidden
          className="absolute bottom-0 leading-none opacity-70"
          style={{ right: 0, fontSize: glyph * 0.7 }}
        >
          🏁
        </span>

        <span
          aria-hidden
          className="absolute bottom-0 grid place-items-center transition-[left] duration-100 ease-linear"
          style={{ left: `${travel}%`, width: glyph, height: glyph, transform: "translateX(-50%)" }}
        >
          <MascotFigure character={mascot} media={media} dancing={celebrate} size={glyph} />
        </span>
      </div>
    </div>
  );
}
