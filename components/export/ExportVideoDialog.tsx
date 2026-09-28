"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Quiz } from "@/types/quiz";
import { themeVars } from "@/lib/themes";
import { Button } from "@/components/ui/Button";
import {
  QUALITIES,
  decideFormat,
  outputSize,
  probeCapabilities,
  videoBitrate,
  webCodecsAvailable,
  type Capabilities,
  type FormatChoice,
  type Fps,
  type Quality,
} from "@/lib/videoExport/codecs";
import { runExport, type ExportProgress, type ExportResult } from "@/lib/videoExport/encode";
import type { Framing } from "@/lib/videoExport/renderer";
import { buildTimeline, type AnswerMode } from "@/lib/videoExport/timeline";

interface Props {
  quiz: Quiz;
  defaultFraming?: Framing;
  onClose: () => void;
}

type Status =
  | { kind: "idle" }
  | { kind: "running"; progress: ExportProgress }
  | { kind: "done"; result: ExportResult; url: string }
  | { kind: "error"; message: string };

const FRAMING_CARDS: { id: Framing; title: string; sub: string; w: number; h: number }[] = [
  { id: "vertical", title: "Vertical 9:16", sub: "Shorts · Reels · TikTok", w: 18, h: 32 },
  { id: "horizontal", title: "Horizontal 16:9", sub: "YouTube", w: 32, h: 18 },
];

const PHASE_LABEL: Record<ExportProgress["phase"], string> = {
  loading: "Loading pictures and fonts…",
  audio: "Rendering the soundtrack…",
  frames: "Rendering and encoding frames…",
  finalizing: "Finishing the file…",
};

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))} KB`;
}

function download(url: string, filename: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function fileFor(result: ExportResult): File | null {
  try {
    return new File([result.blob], result.filename, { type: result.mimeType });
  } catch {
    return null;
  }
}

function canShareFile(result: ExportResult): boolean {
  if (typeof navigator === "undefined" || !navigator.canShare) return false;
  const file = fileFor(result);
  try {
    return !!file && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** iOS/iPadOS Safari tends to open blob downloads in a viewer; the share sheet ("Save Video") is more reliable there. */
function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function ExportVideoDialog({ quiz, defaultFraming = "vertical", onClose }: Props) {
  const [framing, setFraming] = useState<Framing>(defaultFraming);
  const [chosenQuality, setQuality] = useState<Quality>("1080p");
  const [fps, setFps] = useState<Fps>(30);
  const [format, setFormat] = useState<FormatChoice>("auto");
  const [answerMode, setAnswerMode] = useState<AnswerMode>("pick-correct");
  const [sound, setSound] = useState<boolean>(quiz.settings.sound);
  // Keyed by framing|fps|quality, so switching back and forth never re-probes.
  const [probed, setProbed] = useState<Record<string, Capabilities>>({});
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const urlRef = useRef<string | null>(null);
  const supported = webCodecsAvailable();
  const running = status.kind === "running";

  // Probe every resolution for the current framing/fps so unsupported ones can be disabled.
  useEffect(() => {
    if (!supported) return;
    let live = true;
    for (const q of QUALITIES) {
      const key = `${framing}|${fps}|${q.id}`;
      const { width, height } = outputSize(framing, q.id);
      void probeCapabilities(width, height, fps, videoBitrate(q.id, fps)).then((result) => {
        if (live) setProbed((prev) => (prev[key] ? prev : { ...prev, [key]: result }));
      });
    }
    return () => {
      live = false;
    };
  }, [framing, fps, supported]);

  const caps: Partial<Record<Quality, Capabilities>> = {};
  for (const q of QUALITIES) {
    const c = probed[`${framing}|${fps}|${q.id}`];
    if (c) caps[q.id] = c;
  }
  const qualityOk = (q: Quality) => {
    const c = caps[q];
    if (!c) return false;
    return format === "auto" ? !!(c.video.mp4 || c.video.webm) : !!c.video[format];
  };
  // If the picked resolution turns out unsupported here, use the best one that is.
  const quality: Quality =
    !caps[chosenQuality] || qualityOk(chosenQuality)
      ? chosenQuality
      : (QUALITIES.find((q) => qualityOk(q.id))?.id ?? chosenQuality);

  const current = caps[quality];
  const decision = current ? decideFormat(current, format, sound) : null;
  const durationMs = useMemo(() => buildTimeline(quiz, { answerMode, sound: false }).durationMs, [quiz, answerMode]);
  const size = outputSize(framing, quality);
  const frames = Math.ceil((durationMs / 1000) * fps);
  const maxBytes = ((videoBitrate(quality, fps) + (sound ? 192_000 : 0)) * durationMs) / 8000;

  // Esc closes (and cancels); scrolling behind the dialog is locked.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  });

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    },
    [],
  );

  function close() {
    abortRef.current?.abort();
    onClose();
  }

  async function start() {
    if (!decision) return;
    if (urlRef.current) {
      URL.revokeObjectURL(urlRef.current);
      urlRef.current = null;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({
      kind: "running",
      progress: { phase: "loading", frame: 0, totalFrames: frames, fraction: 0, etaSeconds: null },
    });
    try {
      const result = await runExport(
        { quiz, framing, quality, fps, answerMode, format: decision },
        (progress) => {
          if (!controller.signal.aborted) setStatus({ kind: "running", progress });
        },
        controller.signal,
      );
      const url = URL.createObjectURL(result.blob);
      urlRef.current = url;
      setStatus({ kind: "done", result, url });
      if (!isIOS() || !canShareFile(result)) download(url, result.filename);
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus({ kind: "idle" });
      } else {
        console.error(error);
        setStatus({
          kind: "error",
          message: error instanceof Error ? error.message : "The export failed for an unknown reason.",
        });
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    setStatus({ kind: "idle" });
  }

  async function share(result: ExportResult) {
    const file = fileFor(result);
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: quiz.title || "Quiz video" });
    } catch {
      // Dismissed share sheet — nothing to do.
    }
  }

  const audioNote = !sound
    ? "Video only (sound off)."
    : !decision
      ? ""
      : decision.audio
        ? `Sound included (${decision.audio.muxCodec === "aac" ? "AAC" : "Opus"}).`
        : format === "mp4" && current?.video.webm && current.audio.webm
          ? "This browser can't encode AAC, so an MP4 would be silent. Choose Auto or WebM to keep the sound (Opus)."
          : "This browser can't encode audio for this format, so the video will be silent.";

  const formatLabel = decision
    ? `${decision.video.container.toUpperCase()} · ${
        decision.video.muxCodec === "avc" ? "H.264" : decision.video.muxCodec === "V_VP9" ? "VP9" : "VP8"
      }${decision.audio ? (decision.audio.muxCodec === "aac" ? " + AAC" : " + Opus") : ""}`
    : current
      ? "Not supported here"
      : "Checking…";

  const dialog = (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink-950/75 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      style={themeVars(quiz.theme)}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !running) close();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-video-title"
        className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-ink-700 bg-ink-900 text-left shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ink-800 px-5 py-4">
          <div className="min-w-0">
            <h2 id="export-video-title" className="text-lg font-bold text-ink-100">
              Export video
            </h2>
            <p className="truncate text-xs text-ink-400">
              {quiz.title || "Untitled quiz"} · {quiz.questions.length}{" "}
              {quiz.questions.length === 1 ? "question" : "questions"} · plays exactly like auto-play
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={close} aria-label="Close">
            ✕
          </Button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm text-ink-200">
          {!supported && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
              This browser can&apos;t encode video (it needs WebCodecs). Use a current Chrome, Edge, Safari 16.4+ or
              Firefox 130+.
            </p>
          )}
          {quiz.questions.length === 0 && (
            <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-amber-200">
              Add a question first — there&apos;s nothing to record yet.
            </p>
          )}

          <fieldset disabled={running} className="space-y-5 disabled:opacity-60">
            <div>
              <Legend>Framing</Legend>
              <div className="grid grid-cols-2 gap-2">
                {FRAMING_CARDS.map((card) => (
                  <button
                    key={card.id}
                    type="button"
                    onClick={() => setFraming(card.id)}
                    aria-pressed={framing === card.id}
                    className={`focus-ring flex items-center gap-3 rounded-2xl border p-3 text-left transition ${
                      framing === card.id
                        ? "border-[var(--accent)] bg-[var(--accent-soft)]"
                        : "border-ink-700 hover:border-ink-500"
                    }`}
                  >
                    <span
                      className="shrink-0 rounded-[4px] border-2 border-current text-ink-300"
                      style={{ width: card.w, height: card.h }}
                      aria-hidden
                    />
                    <span>
                      <span className="block font-semibold text-ink-100">{card.title}</span>
                      <span className="block text-xs text-ink-400">{card.sub}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Legend>Resolution</Legend>
                <Segmented
                  value={quality}
                  onChange={(v) => setQuality(v as Quality)}
                  options={QUALITIES.map((q) => ({
                    value: q.id,
                    label: q.label,
                    disabled: !qualityOk(q.id),
                    title: !caps[q.id]
                      ? "Checking…"
                      : qualityOk(q.id)
                        ? q.note
                        : "Not supported by this browser's encoder",
                  }))}
                />
                <p className="mt-1 text-xs text-ink-500">
                  {size.width}×{size.height}
                  {quality === "4k" && " · much slower to render"}
                </p>
              </div>
              <div>
                <Legend>Frame rate</Legend>
                <Segmented
                  value={String(fps)}
                  onChange={(v) => setFps(Number(v) as Fps)}
                  options={[
                    { value: "30", label: "30 fps" },
                    { value: "60", label: "60 fps" },
                  ]}
                />
              </div>
            </div>

            <div>
              <Legend>File format</Legend>
              <Segmented
                value={format}
                onChange={(v) => setFormat(v as FormatChoice)}
                options={[
                  { value: "auto", label: "Auto" },
                  { value: "mp4", label: "MP4", disabled: !!current && !current.video.mp4 },
                  { value: "webm", label: "WebM", disabled: !!current && !current.video.webm },
                ]}
              />
              <p className="mt-1 text-xs text-ink-500">{formatLabel}</p>
            </div>

            <div>
              <Legend>Answers</Legend>
              <Segmented
                value={answerMode}
                onChange={(v) => setAnswerMode(v as AnswerMode)}
                options={[
                  { value: "pick-correct", label: "Show correct pick" },
                  { value: "timeout", label: "Let the clock run out" },
                ]}
              />
              <p className="mt-1 text-xs text-ink-500">
                {answerMode === "pick-correct"
                  ? "A player picks the right answer with a second left: select ring, then the correct reveal."
                  : "Nobody answers — exactly what auto-play does when left alone (out of time, answer shown)."}
              </p>
            </div>

            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                checked={sound}
                onChange={(event) => setSound(event.target.checked)}
              />
              <span>
                <span className="block font-medium text-ink-100">Include sound</span>
                <span className="block text-xs text-ink-500">
                  {audioNote || "Ticks, select, reveal, correct/wrong and cue sounds, timed like auto-play."}
                </span>
              </span>
            </label>
          </fieldset>

          <p className="text-xs text-ink-500">
            {formatDuration(durationMs)} · {frames.toLocaleString()} frames · up to ~{formatBytes(maxBytes)}
          </p>

          {status.kind === "running" && <ProgressBlock progress={status.progress} />}

          {status.kind === "error" && (
            <p className="rounded-xl border border-bad/40 bg-bad/10 p-3 text-bad">Export failed: {status.message}</p>
          )}

          {status.kind === "done" && (
            <div className="space-y-3 rounded-2xl border border-ink-700 bg-ink-950/60 p-3">
              <p className="font-semibold text-ink-100">
                Done — {status.result.filename} ({formatBytes(status.result.blob.size)})
              </p>
              {!status.result.hasAudio && sound && (
                <p className="text-xs text-amber-200">This file has no sound track.</p>
              )}
              {status.result.warnings.map((w) => (
                <p key={w} className="text-xs text-amber-200">
                  {w}
                </p>
              ))}
              <video
                src={status.url}
                controls
                playsInline
                className="max-h-64 w-full rounded-xl bg-black"
                aria-label="Preview of the exported video"
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" size="sm" onClick={() => download(status.url, status.result.filename)}>
                  Download{isIOS() ? "" : " again"}
                </Button>
                {canShareFile(status.result) && (
                  <Button variant="outline" size="sm" onClick={() => share(status.result)}>
                    Share / Save to device
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-ink-800 px-5 py-3">
          {running ? (
            <Button variant="danger" size="md" onClick={cancel}>
              Cancel export
            </Button>
          ) : (
            <>
              <Button variant="ghost" size="md" onClick={close}>
                Close
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={start}
                disabled={!supported || !decision || quiz.questions.length === 0}
              >
                {status.kind === "done" ? "Export again" : "Export video"}
              </Button>
            </>
          )}
        </footer>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}

function Legend({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-400">{children}</p>;
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; disabled?: boolean; title?: string }[];
}) {
  return (
    <div role="radiogroup" className="flex flex-wrap gap-1 rounded-xl border border-ink-700 bg-ink-950/50 p-1">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
          className={`focus-ring flex-1 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-35 ${
            value === option.value ? "bg-[var(--accent)] text-ink-950" : "text-ink-300 hover:bg-ink-800"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function ProgressBlock({ progress }: { progress: ExportProgress }) {
  const pct = Math.floor(progress.fraction * 100);
  const eta =
    progress.etaSeconds === null
      ? null
      : progress.etaSeconds < 60
        ? `${Math.ceil(progress.etaSeconds)}s left`
        : `${Math.ceil(progress.etaSeconds / 60)} min left`;
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex justify-between text-xs text-ink-300">
        <span>{PHASE_LABEL[progress.phase]}</span>
        <span className="tabular-nums">{pct}%</span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-ink-800"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
      >
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs tabular-nums text-ink-500">
        Frame {progress.frame.toLocaleString()} / {progress.totalFrames.toLocaleString()}
        {eta && ` · ${eta}`} · keep this tab open
      </p>
    </div>
  );
}
