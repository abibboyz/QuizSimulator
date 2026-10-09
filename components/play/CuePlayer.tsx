"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import confetti from "canvas-confetti";
import type { Cue } from "@/types/quiz";
import { cueHoldMs } from "@/lib/cues";
import { playCountdownBeep, playCue } from "@/lib/sound";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { useMediaUrl } from "@/hooks/useMediaUrl";
import { COUNTDOWN_BEATS, CUE_CONFETTI, STAR_LANES, countdownBeatTransitionS } from "@/lib/playTiming";
import { assemblyPieces, motionFrames, pieceWindow, type PhotoAssemblyStyle } from "@/lib/photoAssembly";

interface Props {
  cue: Cue;
  /** Fired once the cue has finished — callers use it to resume the run. */
  onDone: () => void;
  /** Whether sound is allowed at all. Motion still plays when this is false. */
  soundOn: boolean;
  hideImageBox?: boolean;
  /**
   * Fired halfway through, for callers that need to change what sits underneath
   * mid-cue. A transition cue swaps the question here so the cue spans the
   * change rather than sitting entirely on the question being left.
   */
  onMidpoint?: () => void;
}

/**
 * Draws one cue over the stage and reports when it's done.
 *
 * The overlay is inert by design — `pointer-events-none` and `aria-hidden` —
 * so a celebration can never swallow a tap or drag a screen reader through
 * decoration. `onDone` always fires, including when motion is suppressed, so a
 * cue can never leave the run stuck waiting on an animation that never ran.
 */
export function CuePlayer({ cue, onDone, soundOn, hideImageBox = false, onMidpoint }: Props) {
  const reduced = useReducedMotion();
  const holdMs = cueHoldMs(cue);
  const imageUrl = useMediaUrl(cue.animation === "image" ? cue.media : undefined);

  // Callers usually pass an inline arrow; a ref keeps it out of the timer's deps
  // so a parent re-render can't restart the hold.
  const doneRef = useRef(onDone);
  useEffect(() => {
    doneRef.current = onDone;
  }, [onDone]);

  const midRef = useRef(onMidpoint);
  useEffect(() => {
    midRef.current = onMidpoint;
  }, [onMidpoint]);

  /*
   * Both of these are read once, when the cue starts, and deliberately kept out
   * of the effect below. As dependencies they would tear the effect down and
   * rebuild it mid-cue — hitting mute during a three-second "between" cue would
   * restart its hold and delay the next question by another three seconds, and
   * re-fire the confetti on the way past.
   */
  const soundRef = useRef(soundOn);
  const reducedRef = useRef(reduced);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  useEffect(() => {
    if (soundRef.current) playCue(cue.sound, cue.soundMedia);

    // Confetti is a canvas burst rather than a rendered element, so it fires
    // here alongside the sound instead of in the tree below.
    if (!reducedRef.current && cue.animation === "confetti") {
      const { bursts, ...common } = CUE_CONFETTI;
      for (const { x, y, angle } of bursts) confetti({ ...common, origin: { x, y }, angle });
    }

    // With motion suppressed the visuals are skipped, so there is nothing to
    // wait for beyond letting the sound land.
    const wait = reducedRef.current ? Math.min(holdMs, 400) : holdMs;
    const half = window.setTimeout(() => midRef.current?.(), wait / 2);
    const id = window.setTimeout(() => doneRef.current(), wait);
    return () => {
      window.clearTimeout(half);
      window.clearTimeout(id);
    };
  }, [cue, holdMs]);

  if (reduced || !cue.animation || cue.animation === "confetti") return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden" aria-hidden>
      {cue.animation === "countdown" && <Countdown holdMs={holdMs} soundOn={soundOn} />}
      {cue.animation === "stars" && <Stars holdMs={holdMs} />}
      {cue.animation === "shooting-star" && <ShootingStars holdMs={holdMs} />}
      {cue.animation === "fireworks" && <Fireworks holdMs={holdMs} />}
      {cue.animation === "hearts" && <FloatingGlyphs holdMs={holdMs} glyph="♥" />}
      {cue.animation === "bubbles" && <Bubbles holdMs={holdMs} />}
      {cue.animation === "sparkle-wave" && <SparkleWave holdMs={holdMs} />}
      {cue.animation && isAssemblyCue(cue.animation) && <ShapeGather style={cue.animation} holdMs={holdMs} />}
      {cue.animation === "pulse-ring" && <PulseRing holdMs={holdMs} />}
      {cue.animation === "shake" && <Shake holdMs={holdMs} />}
      {cue.animation === "stamp" && <Stamp holdMs={holdMs} />}
      {cue.animation === "image" && imageUrl && <CueImage url={imageUrl} alt={cue.media?.alt} holdMs={holdMs} hideBox={hideImageBox} />}
    </div>
  );
}

/* ------------------------------------------------------------------ parts */

const BEATS = COUNTDOWN_BEATS;

function Countdown({ holdMs, soundOn }: { holdMs: number; soundOn: boolean }) {
  const [beat, setBeat] = useState(0);
  const perBeat = holdMs / BEATS.length;

  // Out of the deps for the same reason as in CuePlayer: muting between "3" and
  // "2" would replay the beep and restart the beat.
  const soundRef = useRef(soundOn);

  useEffect(() => {
    soundRef.current = soundOn;
  }, [soundOn]);

  useEffect(() => {
    if (soundRef.current) playCountdownBeep(beat === BEATS.length - 1);
    if (beat >= BEATS.length - 1) return;
    const id = window.setTimeout(() => setBeat((b) => b + 1), perBeat);
    return () => window.clearTimeout(id);
  }, [beat, perBeat]);

  return (
    <div className="absolute inset-0 grid place-items-center bg-ink-950/70 backdrop-blur-sm">
      <AnimatePresence mode="wait">
        <motion.span
          key={beat}
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 1.6, opacity: 0 }}
          transition={{ duration: countdownBeatTransitionS(perBeat), ease: [0.2, 0.8, 0.3, 1] }}
          className="stage-prompt font-extrabold tabular-nums"
          style={{ color: "var(--accent)", fontSize: "clamp(5rem, 22vw, 16rem)" }}
        >
          {BEATS[beat]}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// Fixed offsets rather than Math.random() — see STAR_LANES in lib/playTiming.

function Stars({ holdMs }: { holdMs: number }) {
  return (
    <>
      {STAR_LANES.map((left, i) => (
        <motion.span
          key={left}
          initial={{ y: "-15vh", opacity: 0, rotate: 0 }}
          animate={{ y: "110vh", opacity: [0, 1, 1, 0], rotate: 220 }}
          transition={{ duration: holdMs / 1000, delay: (i % 5) * 0.12, ease: "easeIn" }}
          className="absolute text-3xl"
          style={{ left: `${left}%`, color: "var(--accent)" }}
        >
          ★
        </motion.span>
      ))}
    </>
  );
}

function ShootingStars({ holdMs }: { holdMs: number }) {
  return <>{Array.from({ length: 7 }, (_, i) => (
    <motion.span key={i} initial={{ x: "-20vw", y: `${8 + i * 11}vh`, opacity: 0 }} animate={{ x: "115vw", y: `${48 + i * 11}vh`, opacity: [0, 1, 1, 0] }} transition={{ duration: holdMs / 1000, delay: i * 0.09, ease: "easeIn" }} className="absolute text-4xl" style={{ color: "var(--accent)", textShadow: "-22px -8px 12px var(--accent)" }}>★</motion.span>
  ))}</>;
}

function Fireworks({ holdMs }: { holdMs: number }) {
  const centers = [[28, 38], [70, 30], [52, 66]];
  return <>{centers.flatMap(([x, y], burst) => Array.from({ length: 12 }, (_, i) => {
    const angle = i * Math.PI * 2 / 12;
    const distance = 10 + burst * 2;
    return <motion.span key={`${burst}-${i}`} initial={{ left: `${x}vw`, top: `${y}vh`, scale: 0, opacity: 0 }} animate={{ x: `${Math.cos(angle) * distance}vw`, y: `${Math.sin(angle) * distance}vh`, scale: [0, 1, 0.4], opacity: [0, 1, 0] }} transition={{ duration: holdMs / 1000, delay: burst * 0.16, ease: "easeOut" }} className="absolute h-2.5 w-2.5 rounded-full" style={{ background: "var(--accent)" }} />;
  }))}</>;
}

function FloatingGlyphs({ holdMs, glyph }: { holdMs: number; glyph: string }) {
  return <>{STAR_LANES.map((left, i) => <motion.span key={`${glyph}-${left}`} initial={{ y: "110vh", opacity: 0, scale: 0.5 }} animate={{ y: "-15vh", x: [0, i % 2 ? 24 : -24, 0], opacity: [0, 1, 1, 0], scale: [0.5, 1, 0.8] }} transition={{ duration: holdMs / 1000, delay: (i % 6) * 0.08, ease: "easeOut" }} className="absolute text-3xl" style={{ left: `${left}%`, color: "var(--accent)" }}>{glyph}</motion.span>)}</>;
}

function Bubbles({ holdMs }: { holdMs: number }) {
  return <>{STAR_LANES.map((left, i) => <motion.span key={left} initial={{ y: "108vh", opacity: 0, scale: 0.4 }} animate={{ y: "-12vh", opacity: [0, 0.75, 0.75, 0], scale: [0.4, 1 + (i % 3) * 0.25] }} transition={{ duration: holdMs / 1000, delay: (i % 5) * 0.1, ease: "linear" }} className="absolute h-8 w-8 rounded-full border-2" style={{ left: `${left}%`, borderColor: "var(--accent)" }} />)}</>;
}

function SparkleWave({ holdMs }: { holdMs: number }) {
  return <div className="absolute inset-0 flex items-center justify-around">{Array.from({ length: 15 }, (_, i) => <motion.span key={i} initial={{ opacity: 0, scale: 0, y: 0 }} animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0], y: [0, i % 2 ? 45 : -45, 0] }} transition={{ duration: holdMs / 1000, delay: i * 0.045, ease: "easeInOut" }} className="text-4xl" style={{ color: "var(--accent)" }}>✦</motion.span>)}</div>;
}

const ASSEMBLY_CUES = ["butterfly", "glass-assemble", "mosaic-assemble", "spiral-assemble", "curtain-assemble", "flip-assemble", "zoom-assemble"] as const;

function isAssemblyCue(animation: string): animation is (typeof ASSEMBLY_CUES)[number] {
  return (ASSEMBLY_CUES as readonly string[]).includes(animation);
}

/** The same silhouettes the celebration uses, gathering on the stage. */
function ShapeGather({ style, holdMs }: { style: PhotoAssemblyStyle; holdMs: number }) {
  const parts = assemblyPieces(style, 9);
  return (
    <div className="absolute left-1/2 top-1/2 h-[min(70vh,40rem)] w-[min(70vw,40rem)] -translate-x-1/2 -translate-y-1/2">
      {parts.map((piece) => {
        const frames = motionFrames(piece);
        const timing = pieceWindow(piece.index, parts.length, holdMs);
        return (
          <motion.div
            key={piece.index}
            className="absolute inset-0"
            style={{ background: "var(--accent)" }}
            initial={{ x: frames.x[0], y: frames.y[0], scale: frames.scale[0], rotate: frames.rotate[0], clipPath: frames.clipPath[0], opacity: 0 }}
            animate={{ x: frames.x, y: frames.y, scale: frames.scale, rotate: frames.rotate, clipPath: frames.clipPath, opacity: [0, 1, 1, 0] }}
            transition={{ duration: timing.span / 1000, delay: timing.delay / 1000, times: frames.times, ease: [0.22, 1, 0.36, 1] }}
          />
        );
      })}
    </div>
  );
}

function PulseRing({ holdMs }: { holdMs: number }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      {[0, 0.18].map((delay) => (
        <motion.span
          key={delay}
          initial={{ scale: 0.2, opacity: 0.7 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: holdMs / 1000, delay, ease: "easeOut" }}
          className="absolute h-48 w-48 rounded-full border-4"
          style={{ borderColor: "var(--accent)" }}
        />
      ))}
    </div>
  );
}

function Shake({ holdMs }: { holdMs: number }) {
  // A tinted wash keyed to the accent, jolted sideways. Shaking the real stage
  // would mean the overlay reaching into the layout it sits above.
  return (
    <motion.div
      initial={{ x: 0, opacity: 0.35 }}
      animate={{ x: [0, -14, 12, -8, 5, 0], opacity: 0 }}
      transition={{ duration: holdMs / 1000, ease: "easeOut" }}
      className="absolute inset-0"
      style={{ background: "var(--accent-soft)" }}
    />
  );
}

function Stamp({ holdMs }: { holdMs: number }) {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <motion.span
        initial={{ scale: 2.4, opacity: 0, rotate: -18 }}
        animate={{ scale: [2.4, 0.9, 1], opacity: [0, 1, 1, 0], rotate: -12 }}
        transition={{ duration: holdMs / 1000, times: [0, 0.25, 0.4, 1], ease: "easeOut" }}
        className="rounded-3xl border-8 px-10 py-4 text-6xl font-extrabold uppercase tracking-widest"
        style={{ color: "var(--accent)", borderColor: "var(--accent)" }}
      >
        ★
      </motion.span>
    </div>
  );
}

function CueImage({ url, alt, holdMs, hideBox }: { url: string; alt?: string; holdMs: number; hideBox: boolean }) {
  const seconds = holdMs / 1000;
  return (
    <div className="absolute inset-0 grid place-items-center">
      <motion.img
        src={url}
        alt={alt ?? ""}
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: [0.6, 1, 1, 0.95], opacity: [0, 1, 1, 0] }}
        // Snaps in, holds for most of the duration, then fades — so a short GIF
        // isn't over before it's readable and a long one doesn't outstay.
        transition={{ duration: seconds, times: [0, 0.15, 0.8, 1], ease: "easeOut" }}
        className={`max-h-[60vh] max-w-[70vw] object-contain ${hideBox ? "" : "rounded-3xl drop-shadow-2xl"}`}
      />
    </div>
  );
}
