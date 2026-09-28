/**
 * The soundtrack, rendered offline.
 *
 * The live app synthesizes every blip with oscillators (lib/sound.ts) and
 * plays uploaded cue sounds as decoded buffers. Here the exact same recipes
 * are scheduled on an OfflineAudioContext at the timeline's timestamps — the
 * same timestamps the frame renderer draws from — so sound and picture can't
 * drift, and the whole track renders faster than real time.
 */

import type { MediaRef } from "@/types/quiz";
import { RECIPES, scheduleTone } from "@/lib/sound";
import { getMedia } from "@/lib/storage";
import type { Timeline } from "@/lib/videoExport/timeline";

export const AUDIO_SAMPLE_RATE = 48_000;
export const AUDIO_CHANNELS = 2;
/** Matches playSample's gain for uploaded cue sounds. */
const SAMPLE_GAIN = 0.9;

type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;

function offlineCtor(): OfflineCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor };
  return w.OfflineAudioContext ?? w.webkitOfflineAudioContext ?? null;
}

export function offlineAudioAvailable(): boolean {
  return offlineCtor() !== null;
}

async function sampleBytes(ref: MediaRef): Promise<ArrayBuffer | null> {
  try {
    if (ref.kind === "url") {
      const response = await fetch(ref.url);
      return response.ok ? await response.arrayBuffer() : null;
    }
    const record = await getMedia(ref.id);
    return record ? await record.blob.arrayBuffer() : null;
  } catch {
    return null;
  }
}

function sampleKey(ref: MediaRef): string {
  return ref.kind === "stored" ? ref.id : ref.url;
}

export interface RenderedAudio {
  buffer: AudioBuffer;
  /** Uploaded cue sounds that couldn't be fetched or decoded (left silent). */
  missingSamples: number;
}

/** Renders the whole run's audio; null when the browser has no OfflineAudioContext. */
export async function renderAudio(timeline: Timeline, signal?: AbortSignal): Promise<RenderedAudio | null> {
  const Ctor = offlineCtor();
  if (!Ctor) return null;

  const length = Math.max(1, Math.ceil((timeline.durationMs / 1000) * AUDIO_SAMPLE_RATE));
  const ac = new Ctor(AUDIO_CHANNELS, length, AUDIO_SAMPLE_RATE);
  const out = ac.destination;

  // Decode each uploaded sound once, like the live sample cache.
  const buffers = new Map<string, AudioBuffer | null>();
  let missingSamples = 0;
  for (const event of timeline.audio) {
    if (!("sample" in event)) continue;
    const key = sampleKey(event.sample);
    if (buffers.has(key)) continue;
    signal?.throwIfAborted?.();
    const bytes = await sampleBytes(event.sample);
    let decoded: AudioBuffer | null = null;
    if (bytes) {
      try {
        decoded = await ac.decodeAudioData(bytes);
      } catch {
        decoded = null;
      }
    }
    if (!decoded) missingSamples++;
    buffers.set(key, decoded);
  }

  for (const event of timeline.audio) {
    const at = event.at / 1000;
    if ("recipe" in event) {
      for (const tone of RECIPES[event.recipe]) scheduleTone(ac, out, tone, at);
      continue;
    }
    const buffer = buffers.get(sampleKey(event.sample));
    if (!buffer) continue;
    const source = ac.createBufferSource();
    const env = ac.createGain();
    source.buffer = buffer;
    env.gain.value = SAMPLE_GAIN;
    source.connect(env).connect(out);
    source.start(at);
  }

  signal?.throwIfAborted?.();
  const buffer = await ac.startRendering();
  return { buffer, missingSamples };
}
