/**
 * Sound effects synthesized with the Web Audio API — no audio files to ship,
 * license, or wait on. Browsers block audio until a user gesture, so the
 * context is created lazily on the first play() call.
 */

import type { CueSound, MediaRef } from "@/types/quiz";
import { getMedia } from "@/lib/storage";

let ctx: AudioContext | null = null;
let muted = false;

const MUTE_KEY = "quizsim:muted";

/**
 * Mute lives in module state rather than a store because this file is imported
 * by non-React code and has to stay a singleton. React reads it through
 * `useMuted`, which needs a change signal — hence the subscriber set.
 */
const listeners = new Set<() => void>();

export function initSound() {
  if (typeof window === "undefined") return;
  const next = window.localStorage.getItem(MUTE_KEY) === "1";
  if (next === muted) return;
  muted = next;
  listeners.forEach((fn) => fn());
}

export function isMuted() {
  return muted;
}

export function setMuted(next: boolean) {
  if (next === muted) return;
  muted = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  }
  listeners.forEach((fn) => fn());
}

export function subscribeMuted(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function audio(): AudioContext | null {
  if (typeof window === "undefined" || muted) return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  // Autoplay policies suspend the context until a gesture; resuming is a no-op
  // when it is already running.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  /** Slide to this frequency over the duration. */
  slideTo?: number;
}

function tone({ freq, duration, type = "sine", gain = 0.2, delay = 0, slideTo }: ToneOptions) {
  const ac = audio();
  if (!ac) return;

  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const env = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (slideTo !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), start + duration);
  }

  // Short attack, exponential decay — reads as a "blip" rather than a click.
  env.gain.setValueAtTime(0.0001, start);
  env.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(env).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

export function playTick() {
  tone({ freq: 880, duration: 0.05, type: "square", gain: 0.045 });
}

export function playUrgentTick() {
  tone({ freq: 1200, duration: 0.07, type: "square", gain: 0.08 });
}

export function playSelect() {
  tone({ freq: 520, duration: 0.09, type: "triangle", gain: 0.12 });
}

export function playCorrect() {
  // Major triad arpeggio, rising.
  tone({ freq: 523.25, duration: 0.14, type: "triangle", gain: 0.18 });
  tone({ freq: 659.25, duration: 0.14, type: "triangle", gain: 0.18, delay: 0.09 });
  tone({ freq: 783.99, duration: 0.26, type: "triangle", gain: 0.2, delay: 0.18 });
}

export function playWrong() {
  tone({ freq: 220, duration: 0.32, type: "sawtooth", gain: 0.14, slideTo: 110 });
}

export function playWhoosh() {
  tone({ freq: 320, duration: 0.22, type: "sine", gain: 0.09, slideTo: 720 });
}

export function playFanfare() {
  const notes = [523.25, 659.25, 783.99, 1046.5];
  notes.forEach((freq, i) => {
    tone({ freq, duration: 0.3, type: "triangle", gain: 0.2, delay: i * 0.11 });
  });
  tone({ freq: 1318.5, duration: 0.6, type: "triangle", gain: 0.22, delay: 0.5 });
}

/* ------------------------------------------------------------- cue sounds */

export function playStart() {
  // Two rising notes — "we're off", not "you won something".
  tone({ freq: 392, duration: 0.16, type: "triangle", gain: 0.16 });
  tone({ freq: 587.33, duration: 0.3, type: "triangle", gain: 0.18, delay: 0.12 });
}

/** One beat of a 3-2-1 counter. The last one lands higher, as a go signal. */
export function playCountdownBeep(final = false) {
  if (final) tone({ freq: 880, duration: 0.34, type: "triangle", gain: 0.22, slideTo: 1174.66 });
  else tone({ freq: 587.33, duration: 0.12, type: "square", gain: 0.11 });
}

export function playRiser() {
  tone({ freq: 220, duration: 0.55, type: "triangle", gain: 0.14, slideTo: 880 });
  tone({ freq: 330, duration: 0.55, type: "sine", gain: 0.08, slideTo: 1320, delay: 0.04 });
}

/** Harsh and low — a timeout, not a wrong answer. */
export function playBuzz() {
  tone({ freq: 160, duration: 0.4, type: "square", gain: 0.12 });
  tone({ freq: 155, duration: 0.4, type: "square", gain: 0.1, delay: 0.02 });
}

/** Falling, but resolved rather than mournful: "that's the round, try again". */
export function playConsolation() {
  tone({ freq: 587.33, duration: 0.2, type: "triangle", gain: 0.16 });
  tone({ freq: 493.88, duration: 0.2, type: "triangle", gain: 0.16, delay: 0.16 });
  tone({ freq: 392, duration: 0.42, type: "triangle", gain: 0.18, delay: 0.32 });
}

export function playHeartbeat() {
  tone({ freq: 90, duration: 0.11, type: "sine", gain: 0.16 });
  tone({ freq: 76, duration: 0.15, type: "sine", gain: 0.12, delay: 0.14 });
}

/**
 * The sounds an author can attach to a cue, in the order they're offered.
 * Labels are the dropdown; `play` doubles as the editor's preview button.
 */
export const SOUNDS: Record<CueSound, { label: string; play: () => void }> = {
  start: { label: "Start", play: playStart },
  correct: { label: "Correct chime", play: playCorrect },
  wrong: { label: "Wrong buzz", play: playWrong },
  whoosh: { label: "Whoosh", play: playWhoosh },
  riser: { label: "Riser", play: playRiser },
  buzz: { label: "Time-up buzz", play: playBuzz },
  fanfare: { label: "Fanfare", play: playFanfare },
  consolation: { label: "Consolation", play: playConsolation },
  // Its player needs the cue's file, so the registry entry is a placeholder —
  // playCue routes it to playSample instead of calling this.
  custom: { label: "Custom sound…", play: () => {} },
};

export const SOUND_IDS = Object.keys(SOUNDS) as CueSound[];

export function playCue(sound: CueSound | null, media?: MediaRef) {
  if (!sound) return;
  if (sound === "custom") {
    void playSample(media);
    return;
  }
  SOUNDS[sound]?.play();
}

/* ---------------------------------------------------------- custom sounds */

/**
 * Uploaded sounds play through the same AudioContext as the synthesized ones,
 * so they inherit the mute gate and the gesture unlock for free. Decoding is
 * the slow part, so every buffer is kept after its first use — a cue that fires
 * once per question would otherwise decode once per question.
 */
const samples = new Map<string, AudioBuffer>();

function sampleKey(ref: MediaRef): string {
  return ref.kind === "stored" ? ref.id : ref.url;
}

async function bytesFor(ref: MediaRef): Promise<ArrayBuffer | null> {
  if (ref.kind === "url") {
    const response = await fetch(ref.url);
    return response.ok ? await response.arrayBuffer() : null;
  }
  const record = await getMedia(ref.id);
  return record ? await record.blob.arrayBuffer() : null;
}

async function bufferFor(ac: AudioContext, ref: MediaRef): Promise<AudioBuffer | null> {
  const key = sampleKey(ref);
  const cached = samples.get(key);
  if (cached) return cached;

  try {
    const bytes = await bytesFor(ref);
    if (!bytes) return null;
    const decoded = await ac.decodeAudioData(bytes);
    samples.set(key, decoded);
    return decoded;
  } catch {
    // A missing or unsupported file must not take the run down with it.
    return null;
  }
}

export async function playSample(ref: MediaRef | undefined) {
  const ac = audio();
  if (!ac || !ref) return;

  const buffer = await bufferFor(ac, ref);
  if (!buffer) return;

  const source = ac.createBufferSource();
  const env = ac.createGain();
  source.buffer = buffer;
  env.gain.value = 0.9;
  source.connect(env).connect(ac.destination);
  source.start();
}

/**
 * Decodes ahead of time so the first fire isn't late. Called when a quiz loads;
 * a cue that lands 40ms after the moment it belongs to reads as broken.
 */
export function primeSamples(refs: (MediaRef | undefined)[]) {
  const ac = audio();
  if (!ac) return;
  for (const ref of refs) {
    if (ref && !samples.has(sampleKey(ref))) void bufferFor(ac, ref);
  }
}
