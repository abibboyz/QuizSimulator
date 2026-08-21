/**
 * Sound effects synthesized with the Web Audio API — no audio files to ship,
 * license, or wait on. Browsers block audio until a user gesture, so the
 * context is created lazily on the first play() call.
 */

let ctx: AudioContext | null = null;
let muted = false;

const MUTE_KEY = "quizsim:muted";

export function initSound() {
  if (typeof window === "undefined") return;
  muted = window.localStorage.getItem(MUTE_KEY) === "1";
}

export function isMuted() {
  return muted;
}

export function setMuted(next: boolean) {
  muted = next;
  if (typeof window !== "undefined") {
    window.localStorage.setItem(MUTE_KEY, next ? "1" : "0");
  }
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
