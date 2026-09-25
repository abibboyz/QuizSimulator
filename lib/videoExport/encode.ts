/**
 * The export pipeline: timeline → (offline audio) → frame-by-frame canvas
 * render → WebCodecs encoders → MP4/WebM muxer → Blob.
 *
 * Frames are rendered at t = i / fps from the pure timeline, never captured
 * from the live page, so the output is identical on a fast or slow machine
 * and doesn't care whether the tab is in the foreground.
 */

import type { Quiz } from "@/types/quiz";
import { Muxer as Mp4Muxer, StreamTarget as Mp4Target } from "mp4-muxer";
import { Muxer as WebmMuxer, StreamTarget as WebmTarget } from "webm-muxer";
import { AUDIO_CHANNELS, AUDIO_SAMPLE_RATE, renderAudio } from "@/lib/videoExport/audio";
import { loadAssets, releaseAssets } from "@/lib/videoExport/assets";
import type { FormatDecision, Fps, Quality } from "@/lib/videoExport/codecs";
import { outputSize } from "@/lib/videoExport/codecs";
import { FrameRenderer, type Framing } from "@/lib/videoExport/renderer";
import { buildTimeline, type AnswerMode } from "@/lib/videoExport/timeline";

export interface ExportRequest {
  quiz: Quiz;
  framing: Framing;
  quality: Quality;
  fps: Fps;
  answerMode: AnswerMode;
  format: FormatDecision;
}

export type ExportPhase = "loading" | "audio" | "frames" | "finalizing";

export interface ExportProgress {
  phase: ExportPhase;
  frame: number;
  totalFrames: number;
  /** 0..1 across the whole job. */
  fraction: number;
  /** Seconds left, once there's enough history to guess. */
  etaSeconds: number | null;
}

export interface ExportResult {
  blob: Blob;
  filename: string;
  mimeType: string;
  durationMs: number;
  width: number;
  height: number;
  hasAudio: boolean;
  warnings: string[];
}

/** Frames queued inside the encoder before we wait; keeps memory flat at 4K. */
const MAX_ENCODE_QUEUE = 6;
const KEYFRAME_EVERY_S = 2;
/** Audio is fed to the encoder in 100ms slices, just ahead of the video. */
const AUDIO_SLICE = AUDIO_SAMPLE_RATE / 10;

export function exportFilename(quiz: Quiz, framing: Framing, quality: Quality, fps: Fps, ext: string): string {
  const slug =
    quiz.title
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "quiz";
  return `${slug}-${framing}-${quality}${fps === 60 ? "-60fps" : ""}.${ext}`;
}

/** Lets the dialog repaint between frames without setTimeout's 4ms clamp or background-tab throttling. */
const yieldToEventLoop = (() => {
  let channel: MessageChannel | null = null;
  const pending: (() => void)[] = [];
  return () =>
    new Promise<void>((resolve) => {
      if (typeof MessageChannel === "undefined") {
        setTimeout(resolve, 0);
        return;
      }
      if (!channel) {
        channel = new MessageChannel();
        channel.port1.onmessage = () => pending.shift()?.();
      }
      pending.push(resolve);
      channel.port2.postMessage(null);
    });
})();

function waitForDequeue(encoder: VideoEncoder | AudioEncoder): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      encoder.removeEventListener("dequeue", finish);
      resolve();
    };
    encoder.addEventListener("dequeue", finish);
    // Not every browser fires `dequeue`; poll as a fallback.
    setTimeout(finish, 20);
  });
}

function abortError(): DOMException {
  return new DOMException("Export cancelled", "AbortError");
}

/**
 * Collects the muxer's output as a list of parts instead of one growing
 * ArrayBuffer, so a long export needs ~1× its file size in memory rather than
 * the 2–3× a doubling buffer peaks at. Muxers occasionally seek back to patch
 * a header (box sizes, duration); those writes land inside existing parts.
 */
class PartsWriter {
  private readonly parts: Uint8Array[] = [];
  private readonly offsets: number[] = [];
  private size = 0;

  write = (data: Uint8Array, position: number) => {
    let pos = position;
    let rest = data;
    while (rest.length > 0 && pos < this.size) {
      const i = this.partAt(pos);
      const part = this.parts[i];
      const start = pos - this.offsets[i];
      const n = Math.min(rest.length, part.length - start);
      part.set(rest.subarray(0, n), start);
      rest = rest.subarray(n);
      pos += n;
    }
    if (rest.length === 0) return;
    if (pos > this.size) this.append(new Uint8Array(pos - this.size));
    this.append(rest.slice());
  };

  private append(bytes: Uint8Array) {
    this.parts.push(bytes);
    this.offsets.push(this.size);
    this.size += bytes.length;
  }

  private partAt(pos: number): number {
    let lo = 0;
    let hi = this.parts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.offsets[mid] <= pos) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  toBlob(type: string): Blob {
    return new Blob(this.parts as BlobPart[], { type });
  }
}

interface AnyMuxer {
  addVideoChunk(chunk: EncodedVideoChunk, meta?: EncodedVideoChunkMetadata): void;
  addAudioChunk(chunk: EncodedAudioChunk, meta?: EncodedAudioChunkMetadata): void;
  finalize(): void;
}

function createMuxer(
  format: FormatDecision,
  width: number,
  height: number,
  fps: number,
  writer: PartsWriter,
): { muxer: AnyMuxer; mimeType: string; ext: string } {
  const { video, audio } = format;
  if (video.container === "mp4") {
    const muxer = new Mp4Muxer({
      target: new Mp4Target({ onData: writer.write, chunked: true, chunkSize: 4 * 2 ** 20 }),
      video: { codec: "avc", width, height, frameRate: fps },
      audio: audio
        ? { codec: audio.muxCodec, numberOfChannels: AUDIO_CHANNELS, sampleRate: AUDIO_SAMPLE_RATE }
        : undefined,
      // Metadata at the end: the lightest option on memory, and uploads/editors don't care.
      fastStart: false,
      firstTimestampBehavior: "offset",
    });
    return { muxer, mimeType: "video/mp4", ext: "mp4" };
  }
  const muxer = new WebmMuxer({
    target: new WebmTarget({ onData: writer.write, chunked: true, chunkSize: 4 * 2 ** 20 }),
    video: { codec: video.muxCodec, width, height, frameRate: fps },
    audio: audio ? { codec: "A_OPUS", numberOfChannels: AUDIO_CHANNELS, sampleRate: AUDIO_SAMPLE_RATE } : undefined,
    firstTimestampBehavior: "offset",
  });
  return { muxer, mimeType: "video/webm", ext: "webm" };
}

const WEIGHT = { loading: 0.03, audio: 0.05, frames: 0.9, finalizing: 0.02 };

export async function runExport(
  request: ExportRequest,
  onProgress: (progress: ExportProgress) => void,
  signal: AbortSignal,
): Promise<ExportResult> {
  const { quiz, framing, quality, fps, answerMode, format } = request;
  const { width, height } = outputSize(framing, quality);
  const withAudio = !!format.audio;
  const timeline = buildTimeline(quiz, { answerMode, sound: withAudio });
  const totalFrames = Math.max(1, Math.ceil((timeline.durationMs / 1000) * fps));
  const warnings: string[] = [];
  const report = (phase: ExportPhase, frame: number, fraction: number, etaSeconds: number | null = null) =>
    onProgress({ phase, frame, totalFrames, fraction: Math.min(1, fraction), etaSeconds });
  const check = () => {
    if (signal.aborted) throw abortError();
  };

  report("loading", 0, 0);
  const { assets, missingImages } = await loadAssets(
    quiz,
    (done, total) => report("loading", 0, WEIGHT.loading * (total ? done / total : 1)),
    signal,
  );
  if (missingImages > 0) {
    warnings.push(
      `${missingImages} picture${missingImages === 1 ? "" : "s"} couldn't be loaded (web images must allow cross-origin access) and ${missingImages === 1 ? "is" : "are"} left blank.`,
    );
  }

  let videoEncoder: VideoEncoder | null = null;
  let audioEncoder: AudioEncoder | null = null;
  try {
    check();
    let audioBuffer: AudioBuffer | null = null;
    if (withAudio) {
      report("audio", 0, WEIGHT.loading);
      const rendered = await renderAudio(timeline, signal);
      if (rendered) {
        audioBuffer = rendered.buffer;
        if (rendered.missingSamples > 0) {
          warnings.push(`${rendered.missingSamples} uploaded cue sound(s) couldn't be decoded and are silent.`);
        }
      } else {
        warnings.push("This browser can't render audio offline, so the video is silent.");
      }
    }
    check();

    const writer = new PartsWriter();
    const hasAudioTrack = !!(audioBuffer && format.audio);
    const { muxer, mimeType, ext } = createMuxer(
      hasAudioTrack ? format : { ...format, audio: null },
      width,
      height,
      fps,
      writer,
    );

    let encodeError: unknown = null;
    const fail = (e: unknown) => {
      encodeError ??= e;
    };
    const guard = () => {
      if (encodeError) throw encodeError instanceof Error ? encodeError : new Error(String(encodeError));
      check();
    };

    videoEncoder = new VideoEncoder({
      output: (chunk, meta) => {
        try {
          muxer.addVideoChunk(chunk, meta);
        } catch (e) {
          fail(e);
        }
      },
      error: fail,
    });
    videoEncoder.configure({ ...format.video.config, width, height, framerate: fps });

    // Audio: feed 100ms slices of the pre-rendered track, staying just ahead of the video.
    let audioCursor = 0;
    const audioFrames = audioBuffer?.length ?? 0;
    const left = audioBuffer?.getChannelData(0);
    const right = audioBuffer && audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;
    if (hasAudioTrack && format.audio) {
      audioEncoder = new AudioEncoder({
        output: (chunk, meta) => {
          try {
            muxer.addAudioChunk(chunk, meta);
          } catch (e) {
            fail(e);
          }
        },
        error: fail,
      });
      audioEncoder.configure(format.audio.config);
    }
    const feedAudioUntil = (seconds: number) => {
      if (!audioEncoder || !left || !right) return;
      const until = Math.min(audioFrames, Math.ceil(seconds * AUDIO_SAMPLE_RATE));
      while (audioCursor < until) {
        const n = Math.min(AUDIO_SLICE, audioFrames - audioCursor);
        const planar = new Float32Array(n * AUDIO_CHANNELS);
        planar.set(left.subarray(audioCursor, audioCursor + n), 0);
        planar.set(right.subarray(audioCursor, audioCursor + n), n);
        const data = new AudioData({
          format: "f32-planar",
          sampleRate: AUDIO_SAMPLE_RATE,
          numberOfFrames: n,
          numberOfChannels: AUDIO_CHANNELS,
          timestamp: Math.round((audioCursor / AUDIO_SAMPLE_RATE) * 1e6),
          data: planar,
        });
        audioEncoder.encode(data);
        data.close();
        audioCursor += n;
      }
    };

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const renderer = new FrameRenderer(canvas, timeline, quiz, framing, assets);
    const keyEvery = Math.max(1, Math.round(fps * KEYFRAME_EVERY_S));
    const frameUs = 1e6 / fps;
    const base = WEIGHT.loading + (withAudio ? WEIGHT.audio : 0);
    const span = WEIGHT.frames + (withAudio ? 0 : WEIGHT.audio);
    const started = performance.now();
    let lastYield = started;

    for (let i = 0; i < totalFrames; i++) {
      guard();
      renderer.render((i * 1000) / fps);
      const timestamp = Math.round(i * frameUs);
      const frame = new VideoFrame(canvas, {
        timestamp,
        duration: Math.round((i + 1) * frameUs) - timestamp,
      });
      try {
        videoEncoder.encode(frame, { keyFrame: i % keyEvery === 0 });
      } finally {
        frame.close();
      }
      feedAudioUntil((i + 2) / fps);

      while (videoEncoder.encodeQueueSize > MAX_ENCODE_QUEUE) {
        await waitForDequeue(videoEncoder);
        guard();
      }
      const now = performance.now();
      if (now - lastYield > 40 || i === totalFrames - 1) {
        lastYield = now;
        const done = i + 1;
        const rate = done / Math.max(1, now - started);
        const eta = done >= Math.min(30, totalFrames) ? (totalFrames - done) / rate / 1000 : null;
        report("frames", done, base + span * (done / totalFrames), eta);
        await yieldToEventLoop();
      }
    }

    report("finalizing", totalFrames, base + span);
    feedAudioUntil(Infinity);
    await videoEncoder.flush();
    if (audioEncoder) await audioEncoder.flush();
    guard();
    muxer.finalize();
    const blob = writer.toBlob(mimeType);
    report("finalizing", totalFrames, 1, 0);

    return {
      blob,
      filename: exportFilename(quiz, framing, quality, fps, ext),
      mimeType,
      durationMs: (totalFrames * 1000) / fps,
      width,
      height,
      hasAudio: hasAudioTrack,
      warnings,
    };
  } finally {
    for (const encoder of [videoEncoder, audioEncoder]) {
      if (encoder && encoder.state !== "closed") {
        try {
          encoder.close();
        } catch {
          // already torn down
        }
      }
    }
    releaseAssets(assets);
  }
}
