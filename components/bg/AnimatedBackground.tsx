"use client";

import { useEffect, useRef } from "react";
import type { BgAnimation, BgImageFit, MediaRef } from "@/types/quiz";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useMediaUrl } from "@/hooks/useMediaUrl";
import { withAlpha } from "@/lib/themes";

interface Props {
  kind: BgAnimation;
  accent: string;
  glow: string;
  surface: string;
  /** Dials the whole effect down behind dense UI like the builder. */
  subtle?: boolean;
  /** Paint inside the nearest positioned ancestor instead of the viewport. */
  contained?: boolean;
  /** Custom background picture, animated GIFs included. */
  image?: MediaRef;
  imageFit?: BgImageFit;
  imageDim?: number;
}

export function AnimatedBackground({
  kind,
  accent,
  glow,
  surface,
  subtle = false,
  contained = false,
  image,
  imageFit = "cover",
  imageDim = 0.45,
}: Props) {
  const reduced = useReducedMotion();
  const useCanvas = kind === "particles" || kind === "starfield";
  const imageUrl = useMediaUrl(image);

  return (
    <div
      aria-hidden
      className={`pointer-events-none inset-0 overflow-hidden ${contained ? "absolute" : "fixed -z-10"}`}
      style={{ background: `radial-gradient(120% 120% at 50% 0%, ${withAlpha(glow, subtle ? 0.1 : 0.22)} 0%, ${surface} 55%, #04050a 100%)` }}
    >
      {/*
        The picture sits under the animation, with a dimming scrim between them
        so a bright or busy image can't swallow the question text.
      */}
      {imageUrl && (
        <>
          <div
            className="absolute inset-0"
            style={{
              backgroundImage: `url("${imageUrl}")`,
              backgroundSize: imageFit === "tile" ? "auto" : imageFit,
              backgroundRepeat: imageFit === "tile" ? "repeat" : "no-repeat",
              backgroundPosition: "center",
            }}
          />
          <div className="absolute inset-0" style={{ background: `rgba(0, 0, 0, ${imageDim})` }} />
        </>
      )}

      {kind === "aurora" && <Aurora accent={accent} glow={glow} subtle={subtle} still={reduced} />}
      {kind === "shapes" && <Shapes accent={accent} glow={glow} subtle={subtle} still={reduced} />}
      {useCanvas && !reduced && <ParticleCanvas kind={kind} accent={accent} glow={glow} subtle={subtle} />}
      {useCanvas && reduced && <Aurora accent={accent} glow={glow} subtle={subtle} still />}

      {/* A faint vignette keeps big white text readable over any of the above. */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_50%,transparent_35%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}

function Aurora({ accent, glow, subtle, still }: { accent: string; glow: string; subtle: boolean; still: boolean }) {
  const opacity = subtle ? 0.2 : 0.45;
  const anim = still ? "" : "animate-aurora";

  return (
    <>
      <div
        className={`absolute -left-1/4 -top-1/3 h-[80vh] w-[80vw] rounded-full blur-3xl ${anim}`}
        style={{ background: withAlpha(accent, opacity) }}
      />
      <div
        className={`absolute -right-1/4 top-0 h-[70vh] w-[70vw] rounded-full blur-3xl ${anim}`}
        style={{ background: withAlpha(glow, opacity), animationDelay: "-6s" }}
      />
      <div
        className={`absolute -bottom-20 left-1/4 h-[60vh] w-[60vw] rounded-full blur-3xl ${anim}`}
        style={{ background: withAlpha(accent, opacity * 0.7), animationDelay: "-12s" }}
      />
    </>
  );
}

const BLOBS = [
  { size: 26, left: 8, top: 12, delay: 0 },
  { size: 18, left: 72, top: 8, delay: -4 },
  { size: 32, left: 58, top: 58, delay: -9 },
  { size: 14, left: 24, top: 68, delay: -14 },
  { size: 20, left: 88, top: 40, delay: -18 },
  { size: 12, left: 42, top: 30, delay: -7 },
];

function Shapes({ accent, glow, subtle, still }: { accent: string; glow: string; subtle: boolean; still: boolean }) {
  const opacity = subtle ? 0.14 : 0.3;

  return (
    <>
      {BLOBS.map((blob, i) => (
        <div
          key={i}
          className={`absolute rounded-full blur-2xl ${still ? "" : "animate-blob"}`}
          style={{
            width: `${blob.size}vw`,
            height: `${blob.size}vw`,
            left: `${blob.left}%`,
            top: `${blob.top}%`,
            background: withAlpha(i % 2 === 0 ? accent : glow, opacity),
            animationDelay: `${blob.delay}s`,
          }}
        />
      ))}
    </>
  );
}

/**
 * Particles and starfield share one canvas loop. The loop stops when the tab is
 * hidden — a background tab spinning rAF for a quiz nobody is watching is pure
 * battery drain.
 */
function ParticleCanvas({ kind, accent, glow, subtle }: { kind: BgAnimation; accent: string; glow: string; subtle: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let width = 0;
    let height = 0;
    let frame = 0;
    let running = true;

    interface Dot { x: number; y: number; vx: number; vy: number; r: number; depth: number }
    let dots: Dot[] = [];

    const seed = () => {
      const density = subtle ? 14000 : 9000;
      const count = Math.min(140, Math.max(28, Math.round((width * height) / (density * dpr))));
      dots = Array.from({ length: count }, () => {
        const depth = Math.random();
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * (kind === "starfield" ? 0.05 : 0.22),
          vy: kind === "starfield" ? 0.06 + depth * 0.22 : (Math.random() - 0.5) * 0.22,
          r: (kind === "starfield" ? 0.5 + depth * 1.5 : 1 + Math.random() * 2) * dpr,
          depth,
        };
      });
    };

    const resize = () => {
      width = canvas.clientWidth * dpr;
      height = canvas.clientHeight * dpr;
      canvas.width = width;
      canvas.height = height;
      seed();
    };

    const draw = () => {
      if (!running) return;
      context.clearRect(0, 0, width, height);

      for (const dot of dots) {
        dot.x += dot.vx * dpr;
        dot.y += dot.vy * dpr;

        // Wrap rather than bounce: no visible edges to the field.
        if (dot.x < -10) dot.x = width + 10;
        if (dot.x > width + 10) dot.x = -10;
        if (dot.y < -10) dot.y = height + 10;
        if (dot.y > height + 10) dot.y = -10;

        context.beginPath();
        context.arc(dot.x, dot.y, dot.r, 0, Math.PI * 2);
        context.fillStyle = withAlpha(dot.depth > 0.5 ? accent : glow, (subtle ? 0.3 : 0.65) * (0.35 + dot.depth * 0.65));
        context.fill();
      }

      if (kind === "particles") {
        const maxDist = 130 * dpr;
        for (let i = 0; i < dots.length; i++) {
          for (let j = i + 1; j < dots.length; j++) {
            const dx = dots[i].x - dots[j].x;
            const dy = dots[i].y - dots[j].y;
            const dist = Math.hypot(dx, dy);
            if (dist > maxDist) continue;
            context.beginPath();
            context.moveTo(dots[i].x, dots[i].y);
            context.lineTo(dots[j].x, dots[j].y);
            context.strokeStyle = withAlpha(accent, (1 - dist / maxDist) * (subtle ? 0.08 : 0.18));
            context.lineWidth = dpr * 0.6;
            context.stroke();
          }
        }
      }

      frame = requestAnimationFrame(draw);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(frame);
      } else if (!running) {
        running = true;
        frame = requestAnimationFrame(draw);
      }
    };

    resize();
    frame = requestAnimationFrame(draw);

    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [kind, accent, glow, subtle]);

  return <canvas ref={ref} className="absolute inset-0 h-full w-full" />;
}
