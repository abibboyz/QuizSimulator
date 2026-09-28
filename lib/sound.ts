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

export interface ToneOptions {
  freq: number;
  duration: number;
  type?: OscillatorType;
  gain?: number;
  delay?: number;
  /** Slide to this frequency over the duration. */
  slideTo?: number;
}

/**
 * Schedules one blip on any audio context — the live one below, or an
 * OfflineAudioContext when a run is being rendered to a video file. Keeping a
 * single implementation is what stops an exported soundtrack drifting from
 * what the app actually plays.
 */
export function scheduleTone(
  ac: BaseAudioContext,
  destination: AudioNode,
  { freq, duration, type = "sine", gain = 0.2, delay = 0, slideTo }: ToneOptions,
  at: number,
) {
  const start = at + delay;
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

  osc.connect(env).connect(destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function tone(options: ToneOptions) {
  const ac = audio();
  if (!ac) return;
  scheduleTone(ac, ac.destination, options, ac.currentTime);
}

function playRecipe(recipe: readonly ToneOptions[]) {
  recipe.forEach(tone);
}

/**
 * Every synthesized sound as data: the blips it's made of, in order. The
 * `play*` functions below just play these, and the video exporter schedules
 * the very same lists offline.
 */
export const RECIPES = {
  tick: [{ freq: 880, duration: 0.05, type: "square", gain: 0.045 }],
  urgentTick: [{ freq: 1200, duration: 0.07, type: "square", gain: 0.08 }],
  select: [{ freq: 520, duration: 0.09, type: "triangle", gain: 0.12 }],
  // Major triad arpeggio, rising.
  correct: [
    { freq: 523.25, duration: 0.14, type: "triangle", gain: 0.18 },
    { freq: 659.25, duration: 0.14, type: "triangle", gain: 0.18, delay: 0.09 },
    { freq: 783.99, duration: 0.26, type: "triangle", gain: 0.2, delay: 0.18 },
  ],
  wrong: [{ freq: 220, duration: 0.32, type: "sawtooth", gain: 0.14, slideTo: 110 }],
  whoosh: [{ freq: 320, duration: 0.22, type: "sine", gain: 0.09, slideTo: 720 }],
  fanfare: [
    ...[523.25, 659.25, 783.99, 1046.5].map(
      (freq, i): ToneOptions => ({ freq, duration: 0.3, type: "triangle", gain: 0.2, delay: i * 0.11 }),
    ),
    { freq: 1318.5, duration: 0.6, type: "triangle", gain: 0.22, delay: 0.5 },
  ],
  // Two rising notes — "we're off", not "you won something".
  start: [
    { freq: 392, duration: 0.16, type: "triangle", gain: 0.16 },
    { freq: 587.33, duration: 0.3, type: "triangle", gain: 0.18, delay: 0.12 },
  ],
  countdownBeep: [{ freq: 587.33, duration: 0.12, type: "square", gain: 0.11 }],
  // The last beat of a 3-2-1 lands higher, as a go signal.
  countdownGo: [{ freq: 880, duration: 0.34, type: "triangle", gain: 0.22, slideTo: 1174.66 }],
  riser: [
    { freq: 220, duration: 0.55, type: "triangle", gain: 0.14, slideTo: 880 },
    { freq: 330, duration: 0.55, type: "sine", gain: 0.08, slideTo: 1320, delay: 0.04 },
  ],
  // Harsh and low — a timeout, not a wrong answer.
  buzz: [
    { freq: 160, duration: 0.4, type: "square", gain: 0.12 },
    { freq: 155, duration: 0.4, type: "square", gain: 0.1, delay: 0.02 },
  ],
  // Falling, but resolved rather than mournful: "that's the round, try again".
  consolation: [
    { freq: 587.33, duration: 0.2, type: "triangle", gain: 0.16 },
    { freq: 493.88, duration: 0.2, type: "triangle", gain: 0.16, delay: 0.16 },
    { freq: 392, duration: 0.42, type: "triangle", gain: 0.18, delay: 0.32 },
  ],
  // A soft upward sweep under a quick sparkle — "here it is", for uncovering a picture.
  reveal: [
    { freq: 440, duration: 0.36, type: "sine", gain: 0.07, slideTo: 1320 },
    ...[1046.5, 1318.5, 1568, 2093].map(
      (freq, i): ToneOptions => ({ freq, duration: 0.18, type: "triangle", gain: 0.09, delay: 0.12 + i * 0.06 }),
    ),
  ],
  heartbeat: [
    { freq: 90, duration: 0.11, type: "sine", gain: 0.16 },
    { freq: 76, duration: 0.15, type: "sine", gain: 0.12, delay: 0.14 },
  ],
} satisfies Record<string, readonly ToneOptions[]>;

export type RecipeId = keyof typeof RECIPES;

export function playTick() {
  playRecipe(RECIPES.tick);
}

export function playUrgentTick() {
  playRecipe(RECIPES.urgentTick);
}

export function playSelect() {
  playRecipe(RECIPES.select);
}

export function playCorrect() {
  playRecipe(RECIPES.correct);
}

export function playWrong() {
  playRecipe(RECIPES.wrong);
}

export function playWhoosh() {
  playRecipe(RECIPES.whoosh);
}

export function playFanfare() {
  playRecipe(RECIPES.fanfare);
}

/* ------------------------------------------------------------- cue sounds */

export function playStart() {
  playRecipe(RECIPES.start);
}

/** One beat of a 3-2-1 counter. The last one lands higher, as a go signal. */
export function playCountdownBeep(final = false) {
  playRecipe(final ? RECIPES.countdownGo : RECIPES.countdownBeep);
}

export function playRiser() {
  playRecipe(RECIPES.riser);
}

/** Harsh and low — a timeout, not a wrong answer. */
export function playBuzz() {
  playRecipe(RECIPES.buzz);
}

/** Falling, but resolved rather than mournful: "that's the round, try again". */
export function playConsolation() {
  playRecipe(RECIPES.consolation);
}

/** Uncovering a hidden picture (Reveal questions). */
export function playReveal() {
  playRecipe(RECIPES.reveal);
}

export function playHeartbeat() {
  playRecipe(RECIPES.heartbeat);
}

/**
 * Which recipe each built-in cue sound plays. `custom` has none — it is the
 * author's own file, played through `playSample`.
 */
export const CUE_SOUND_RECIPES: Record<Exclude<CueSound, "custom">, RecipeId> = {
  start: "start",
  correct: "correct",
  wrong: "wrong",
  whoosh: "whoosh",
  riser: "riser",
  buzz: "buzz",
  fanfare: "fanfare",
  consolation: "consolation",
  reveal: "reveal",
};

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
  reveal: { label: "Reveal sparkle", play: playReveal },
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
