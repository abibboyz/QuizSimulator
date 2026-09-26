/**
 * What this browser can actually encode. Every option in the export dialog is
 * probed with `VideoEncoder.isConfigSupported` / `AudioEncoder.isConfigSupported`
 * first, so unsupported choices are disabled instead of failing mid-export.
 */

import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE } from "@/lib/videoExport/audio";
import type { Framing } from "@/lib/videoExport/renderer";

export type Container = "mp4" | "webm";
export type FormatChoice = "auto" | Container;
export type Quality = "1080p" | "1440p" | "4k";
export type Fps = 30 | 60;

export const QUALITIES: { id: Quality; short: number; label: string; note?: string }[] = [
  { id: "1080p", short: 1080, label: "1080p" },
  { id: "1440p", short: 1440, label: "1440p" },
  { id: "4k", short: 2160, label: "4K", note: "Much slower; not every encoder supports it" },
];

export function outputSize(framing: Framing, quality: Quality): { width: number; height: number } {
  const short = QUALITIES.find((q) => q.id === quality)!.short;
  const long = Math.round((short * 16) / 9);
  return framing === "vertical" ? { width: short, height: long } : { width: long, height: short };
}

/**
 * Upload-grade bitrates: roughly twice YouTube's recommended SDR upload rates,
 * so the platform's own re-encode starts from a clean master. Encoders run in
 * variable-bitrate mode, so the mostly-still quiz frames come out far smaller.
 */
export function videoBitrate(quality: Quality, fps: Fps): number {
  const base = quality === "4k" ? 60e6 : quality === "1440p" ? 32e6 : 16e6;
  return Math.round(base * (fps === 60 ? 1.5 : 1));
}

export const AUDIO_BITRATE = { aac: 192_000, opus: 160_000 } as const;

export function webCodecsAvailable(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoFrame" in window;
}

export function audioEncoderAvailable(): boolean {
  return typeof window !== "undefined" && "AudioEncoder" in window && "AudioData" in window;
}

/* ------------------------------------------------------------------ H.264 */

/** [level_idc, max macroblocks per frame, max macroblocks per second] — H.264 Table A-1. */
const AVC_LEVELS: [number, number, number][] = [
  [0x28, 8192, 245_760], // 4.0
  [0x2a, 8704, 522_240], // 4.2
  [0x32, 22_080, 589_824], // 5.0
  [0x33, 36_864, 983_040], // 5.1
  [0x34, 36_864, 2_073_600], // 5.2
  [0x3c, 139_264, 4_177_920], // 6.0
  [0x3d, 139_264, 8_355_840], // 6.1
  [0x3e, 139_264, 16_711_680], // 6.2
];

/** High, then Main, then Constrained Baseline (the last is what some mobile encoders offer). */
const AVC_PROFILES = ["6400", "4d00", "42e0"];

function avcCandidates(width: number, height: number, fps: number): string[] {
  const frameMbs = Math.ceil(width / 16) * Math.ceil(height / 16);
  const levels = AVC_LEVELS.filter(([, fs, mbps]) => frameMbs <= fs && frameMbs * fps <= mbps).map(([l]) => l);
  const out: string[] = [];
  for (const profile of AVC_PROFILES) {
    for (const level of levels.slice(0, 3)) out.push(`avc1.${profile}${level.toString(16).padStart(2, "0")}`);
  }
  return out;
}

/* -------------------------------------------------------------------- VP9 */

/** [level, max luma samples per frame, max luma samples per second] — VP9 levels. */
const VP9_LEVELS: [string, number, number][] = [
  ["40", 2_228_224, 83_558_400],
  ["41", 2_228_224, 160_432_128],
  ["50", 8_912_896, 311_951_360],
  ["51", 8_912_896, 588_251_136],
  ["52", 8_912_896, 1_176_502_272],
  ["60", 35_651_584, 1_176_502_272],
];

function vp9Candidates(width: number, height: number, fps: number): string[] {
  const px = width * height;
  return VP9_LEVELS.filter(([, fs, rate]) => px <= fs && px * fps <= rate)
    .slice(0, 3)
    .map(([level]) => `vp09.00.${level}.08`);
}

/* ----------------------------------------------------------------- probing */

export interface VideoPlan {
  container: Container;
  /** Codec id for the muxer: mp4-muxer `avc`, webm-muxer `V_VP9` / `V_VP8`. */
  muxCodec: "avc" | "V_VP9" | "V_VP8";
  config: VideoEncoderConfig;
}

export interface AudioPlan {
  muxCodec: "aac" | "opus";
  config: AudioEncoderConfig;
}

async function firstSupported(configs: VideoEncoderConfig[]): Promise<VideoEncoderConfig | null> {
  for (const config of configs) {
    try {
      const result = await VideoEncoder.isConfigSupported(config);
      if (result.supported) return result.config ?? config;
    } catch {
      // A malformed or unknown codec string throws in some browsers; try the next one.
    }
  }
  return null;
}

export async function probeVideo(
  container: Container,
  width: number,
  height: number,
  fps: Fps,
  bitrate: number,
): Promise<VideoPlan | null> {
  if (!webCodecsAvailable()) return null;
  const base = { width, height, framerate: fps, bitrate, latencyMode: "quality" as const };

  if (container === "mp4") {
    const configs = avcCandidates(width, height, fps).map((codec): VideoEncoderConfig => ({
      ...base,
      codec,
      avc: { format: "avc" },
    }));
    const config = await firstSupported(configs);
    return config ? { container, muxCodec: "avc", config } : null;
  }

  const vp9 = await firstSupported(vp9Candidates(width, height, fps).map((codec) => ({ ...base, codec })));
  if (vp9) return { container, muxCodec: "V_VP9", config: vp9 };
  const vp8 = await firstSupported([{ ...base, codec: "vp8" }]);
  return vp8 ? { container, muxCodec: "V_VP8", config: vp8 } : null;
}

export async function probeAudio(container: Container): Promise<AudioPlan | null> {
  if (!audioEncoderAvailable()) return null;
  const muxCodec = container === "mp4" ? "aac" : "opus";
  const config: AudioEncoderConfig = {
    codec: muxCodec === "aac" ? "mp4a.40.2" : "opus",
    sampleRate: AUDIO_SAMPLE_RATE,
    numberOfChannels: AUDIO_CHANNELS,
    bitrate: AUDIO_BITRATE[muxCodec],
  };
  try {
    const result = await AudioEncoder.isConfigSupported(config);
    return result.supported ? { muxCodec, config: result.config ?? config } : null;
  } catch {
    return null;
  }
}

export interface Capabilities {
  webCodecs: boolean;
  /** Per container: can we encode video at this size/fps? */
  video: Record<Container, VideoPlan | null>;
  audio: Record<Container, AudioPlan | null>;
}

export async function probeCapabilities(
  width: number,
  height: number,
  fps: Fps,
  bitrate: number,
): Promise<Capabilities> {
  const [mp4, webm, aac, opus] = await Promise.all([
    probeVideo("mp4", width, height, fps, bitrate),
    probeVideo("webm", width, height, fps, bitrate),
    probeAudio("mp4"),
    probeAudio("webm"),
  ]);
  return { webCodecs: webCodecsAvailable(), video: { mp4, webm }, audio: { mp4: aac, webm: opus } };
}

export interface FormatDecision {
  video: VideoPlan;
  audio: AudioPlan | null;
  /** Set when sound was asked for but can't be encoded in the chosen file. */
  audioDropped: boolean;
}

/**
 * Auto prefers MP4 (H.264 + AAC — what every platform and editor takes), then
 * WebM (VP9/VP8 + Opus) when H.264 or AAC isn't available, and only then a
 * silent file.
 */
export function decideFormat(caps: Capabilities, choice: FormatChoice, wantAudio: boolean): FormatDecision | null {
  const order: Container[] = choice === "auto" ? ["mp4", "webm"] : [choice];
  if (wantAudio) {
    for (const c of order) {
      const video = caps.video[c];
      const audio = caps.audio[c];
      if (video && audio) return { video, audio, audioDropped: false };
    }
  }
  for (const c of order) {
    const video = caps.video[c];
    if (video) return { video, audio: null, audioDropped: wantAudio };
  }
  return null;
}
