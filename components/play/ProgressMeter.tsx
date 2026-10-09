"use client";

import type { MascotMotion, MediaRef, ProgressPulse, ProgressStyle } from "@/types/quiz";
import { COLORFUL_PROGRESS_GRADIENT, litSteps, METER_STEPS, progressThickness, pulseMs, PULSE_CLASS, timerMascotGeometry } from "@/lib/progress";
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
  mascotMotion?: MascotMotion;
  color?: string;
  trackColor?: string;
  thickness?: number;
  showNumber?: boolean;
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
  mascotMotion,
  color,
  trackColor,
  thickness,
  showNumber = true,
  celebrate = false,
  size = 64,
}: Props) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  const tint = urgent ? "var(--color-bad)" : (color ?? "var(--accent)");
  const track = trackColor ?? "rgba(255,255,255,0.12)";

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
        <TimerRing fraction={fraction} secondsLeft={secondsLeft} urgent={urgent} size={size} color={color} trackColor={trackColor} showNumber={showNumber} />
      </div>
    );
  }

  const count = showNumber ? (
    <span className="shrink-0 font-bold tabular-nums" style={{ fontSize: size * 0.34, color: tint }}>
      {secondsLeft}
    </span>
  ) : null;

  if (style === "bar" || style === "colorful") {
    return (
      <div {...common} {...wrapper} className={`flex shrink-0 items-center gap-2 ${wrapper.className}`}>
        {count}
        <div
          className="overflow-hidden rounded-full"
          style={{ width: size * 2.4, height: Math.max(6, size * 0.14), background: track }}
        >
          <div
            className="h-full rounded-full transition-[width] duration-100 ease-linear"
            style={{ width: `${clamped * 100}%`, background: style === "colorful" ? COLORFUL_PROGRESS_GRADIENT : tint }}
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
        className={`relative shrink-0 overflow-hidden rounded-full ${wrapper.className}`}
        style={{ ...wrapper.style, width: size * 1.7, height: size * 0.62, background: track }}
      >
        <div
          className="absolute inset-y-0 left-0 transition-[width] duration-100 ease-linear"
          style={{ width: `${clamped * 100}%`, background: tint, opacity: 0.35 }}
        />
        {showNumber && <span
          className="absolute inset-0 grid place-items-center font-bold tabular-nums"
          style={{ fontSize: size * 0.34, color: tint }}
        >
          {secondsLeft}
        </span>}
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
                background: i < lit ? tint : trackColor ?? "rgba(255,255,255,0.14)",
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
      motion={mascotMotion}
      celebrate={celebrate}
      size={size}
      track={track}
      thickness={progressThickness(thickness)}
      showNumber={showNumber}
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
  motion?: MascotMotion;
  celebrate: boolean;
  size: number;
  track: string;
  thickness: number;
  showNumber: boolean;
  role: "timer";
  "aria-live": "off";
  "aria-label": string;
}

/**
 * A character racing the clock. It starts at the line and walks to the flag as
 * the time drains, so position reads as "how long is left" without a number —
 * and its stride quickens with the pulse period for the same reason.
 */
function MascotMeter({ wrapper, fraction, secondsLeft, tint, mascot, media, motion, celebrate, size, track: trackColor, thickness, showNumber, ...rest }: MascotProps) {
  const track = size * 2.4;
  const glyph = size * 0.5;

  // Pixel travel is deliberate: percentage positioning plus translateX(-50%)
  // made the icon appear pinned at the start in some constrained headers.
  // This keeps its whole box inside the track and reaches both endpoints.
  const { travelPx, fillPx } = timerMascotGeometry(fraction, track, glyph);
  const progressPosition = `${fillPx}px`;

  return (
    <div {...rest} className={`flex shrink-0 items-center gap-2 ${wrapper.className}`} style={wrapper.style}>
      {showNumber && <span className="font-bold tabular-nums" style={{ fontSize: size * 0.3, color: tint }}>
        {secondsLeft}
      </span>}

      <div
        className="relative"
        style={{
          width: track,
          height: glyph * 1.5,
          "--mascot-progress-x": progressPosition,
          "--mascot-travel-x": `${travelPx}px`,
        } as React.CSSProperties}
      >
        <div
          className="absolute inset-x-0 bottom-0 rounded-full"
          style={{ height: thickness, background: trackColor }}
        />
        <div
          className="absolute bottom-0 left-0 rounded-full"
          style={{ width: "var(--mascot-progress-x)", height: thickness, background: tint }}
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
          className="absolute bottom-0 left-0 grid place-items-center will-change-transform"
          // Keep travel on this outer box and the selected walk/bounce/float
          // animation on MascotFigure inside it. Using separate transforms
          // prevents a character animation from replacing the timer movement.
          style={{ transform: "translate3d(var(--mascot-travel-x), 0, 0)", width: glyph, height: glyph }}
        >
          <MascotFigure character={mascot} media={media} motion={motion} dancing={celebrate} size={glyph} />
        </span>
      </div>
    </div>
  );
}
