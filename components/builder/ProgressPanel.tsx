"use client";

import { useEffect, useState } from "react";
import type { QuizSettings } from "@/types/quiz";
import { MASCOTS, PROGRESS_PULSES, PROGRESS_STYLES, QUIZ_PROGRESS_STYLES, showsProgressBar, timerProgressStyle } from "@/lib/progress";
import { Field, Input, Select, Toggle } from "@/components/ui/Field";
import { MediaDropZone } from "@/components/builder/MediaDropZone";
import { ProgressMeter } from "@/components/play/ProgressMeter";
import { QuizProgress } from "@/components/play/QuizProgress";
import { MascotFigure } from "@/components/play/MascotFigure";
import { ColorSwatch } from "@/components/ui/ColorSwatch";

interface Props {
  settings: QuizSettings;
  accent: string;
  onChange: (patch: Partial<QuizSettings>) => void;
}

const PROGRESS_COLORS = ["#22d3ee", "#8b5cf6", "#ec4899", "#f97316", "#facc15", "#22c55e"];

/**
 * Picks the shape of the question timer.
 *
 * The preview runs a real looping countdown through the real meter rather than
 * showing a still: a pulse that accelerates and a mascot that walks are the
 * whole point of these settings, and neither is judgeable frozen.
 */
export function ProgressPanel({ settings, accent, onChange }: Props) {
  const total = settings.timerSeconds && settings.timerSeconds > 0 ? settings.timerSeconds : 20;
  const [fraction, setFraction] = useState(1);

  useEffect(() => {
    const id = window.setInterval(() => {
      setFraction((value) => (value <= 0.02 ? 1 : value - 0.02));
    }, 90);
    return () => window.clearInterval(id);
  }, []);

  const style = PROGRESS_STYLES.find((s) => s.id === settings.progressStyle);
  const pulse = PROGRESS_PULSES.find((p) => p.id === settings.progressPulse);
  const runStyle = QUIZ_PROGRESS_STYLES.find((s) => s.id === settings.quizProgressStyle);

  // A worked example rather than an empty meter: five questions in, three right.
  const sample = [true, false, true, true];

  const usesMascot = settings.progressStyle === "mascot" || settings.quizProgressStyle === "mascot";
  const showBar = showsProgressBar(settings);

  return (
    <div className="space-y-3 rounded-2xl border border-ink-700 p-3">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Question countdown</h3>
        <p className="mt-1 text-xs text-ink-500">Restarts at the beginning of every question.</p>
      </div>

      <div className="flex min-h-20 items-center justify-center rounded-xl border border-ink-800 bg-ink-950/50 px-4 py-4">
        <ProgressMeter
          fraction={fraction}
          secondsLeft={Math.ceil(fraction * total)}
          urgent={fraction <= 0.25}
          style={timerProgressStyle(settings)}
          pulse={settings.progressPulse}
          mascot={settings.progressMascot}
          mascotMedia={settings.progressMascotMedia}
          mascotMotion={settings.progressMascotMotion}
          color={settings.progressColor}
          trackColor={settings.progressTrackColor}
          thickness={settings.progressThickness}
          showNumber={settings.showTimerNumber !== false}
          size={64}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Shape" hint={style?.hint}>
          <Select
            value={settings.progressStyle}
            onChange={(event) => onChange({ progressStyle: event.target.value as QuizSettings["progressStyle"] })}
          >
            {PROGRESS_STYLES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Pulse" hint={pulse?.hint}>
          <Select
            value={settings.progressPulse}
            onChange={(event) => onChange({ progressPulse: event.target.value as QuizSettings["progressPulse"] })}
          >
            {PROGRESS_PULSES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <Toggle
        label="Show timer number"
        hint="Global · applies to every question type, preview, play, host and video export"
        checked={settings.showTimerNumber !== false}
        onChange={(showTimerNumber) => onChange({ showTimerNumber })}
      />

      <div className="space-y-3 border-t border-ink-800 pt-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Quiz position</h3>
          <p className="mt-1 text-xs text-ink-500">Moves from the start on question 1 to the finish on the last question.</p>
        </div>

        <div className="flex min-h-14 items-center rounded-xl border border-ink-800 bg-ink-950/50 px-4 py-3">
          {showBar && settings.quizProgressStyle !== "mascot" && <QuizProgress
            index={4}
            total={8}
            outcomes={sample}
            style={settings.quizProgressStyle}
            mascot={settings.progressMascot}
            mascotMedia={settings.progressMascotMedia}
            mascotMotion={settings.progressMascotMotion}
            color={settings.progressColor}
            trackColor={settings.progressTrackColor}
            thickness={settings.progressThickness}
          />}
          {showBar && settings.quizProgressStyle === "mascot" && (
            <p className="w-full text-center text-xs text-ink-500">Mascot follows the question countdown while a timer is active.</p>
          )}
          {showBar && settings.quizProgressStyle === "none" && (
            <p className="w-full text-center text-xs text-ink-500">No progress meter</p>
          )}
          {!showBar && (
            <p className="w-full text-center text-xs text-ink-500">Progress header hidden</p>
          )}
        </div>

        <Toggle
          label="Show progress header (progress bar, question number, question type)"
          hint="Off hides all three in preview, play, host and video export. The timer stays."
          checked={showBar}
          onChange={(showProgressBar) => onChange({ showProgressBar })}
        />

        <Field label="Shape" hint={runStyle?.hint}>
          <Select
            value={settings.quizProgressStyle}
            onChange={(event) =>
              onChange({ quizProgressStyle: event.target.value as QuizSettings["quizProgressStyle"] })
            }
          >
            {QUIZ_PROGRESS_STYLES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>

      <div className="space-y-3 rounded-xl border border-ink-800 p-3">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Colours</h3>
          <p className="mt-1 text-xs text-ink-500">Shared by the timer and quiz-progress styles. Urgent timers still turn red.</p>
        </div>
        <div className="flex flex-wrap gap-2" aria-label="Suggested progress colours">
          {PROGRESS_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              onClick={() => onChange({ progressColor: color })}
              aria-label={`Use progress colour ${color}`}
              aria-pressed={settings.progressColor === color}
              className={`focus-ring h-7 w-7 rounded-full border-2 transition ${settings.progressColor === color ? "scale-110 border-white" : "border-white/20 hover:border-white/60"}`}
              style={{ background: color }}
            />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Fill"
            hint="Main progress colour"
            action={<ColorSwatch label="Progress fill colour" value={settings.progressColor} fallback={accent} onChange={(progressColor) => onChange({ progressColor })} />}
          >
            <div className="h-9 rounded-xl border border-ink-700" style={{ background: settings.progressColor ?? accent }} />
          </Field>
          <Field
            label="Empty track"
            hint="Background rail colour"
            action={<ColorSwatch label="Progress track colour" value={settings.progressTrackColor} fallback="#374151" onChange={(progressTrackColor) => onChange({ progressTrackColor })} />}
          >
            <div className="h-9 rounded-xl border border-ink-700" style={{ background: settings.progressTrackColor ?? "rgba(255,255,255,0.12)" }} />
          </Field>
        </div>
      </div>

      {usesMascot && (
        <div className="space-y-2 rounded-xl border border-ink-800 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Mascot</h3>
          <div className="flex flex-wrap gap-1.5">
            {MASCOTS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onChange({ progressMascot: emoji, progressMascotMedia: undefined })}
                aria-label={`Use ${emoji} as the mascot`}
                aria-pressed={!settings.progressMascotMedia && settings.progressMascot === emoji}
                className={`focus-ring grid h-9 w-9 place-items-center rounded-lg border text-lg transition ${
                  !settings.progressMascotMedia && settings.progressMascot === emoji
                    ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                    : "border-ink-700 hover:border-ink-600"
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => onChange({
              progressMascotMedia: { kind: "url", url: "/mascots/brain-cell.png", alt: "Green brain cell mascot" },
              progressMascotMotion: "bounce",
            })}
            aria-pressed={settings.progressMascotMedia?.kind === "url" && settings.progressMascotMedia.url === "/mascots/brain-cell.png"}
            className="focus-ring flex w-full items-center gap-3 rounded-xl border border-ink-700 bg-ink-950/50 p-2 text-left transition hover:border-ink-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/mascots/brain-cell.png" alt="" className="h-10 w-10 object-contain" />
            <span>
              <span className="block text-sm font-semibold text-ink-200">Brain cell</span>
              <span className="block text-xs text-ink-500">Inspired by your GIF · starts with Bounce</span>
            </span>
          </button>

          <Field label="Movement" hint="Applied to emoji, built-in pictures and uploaded GIFs">
            <Select
              value={settings.progressMascotMotion ?? "walk"}
              onChange={(event) => onChange({ progressMascotMotion: event.target.value as QuizSettings["progressMascotMotion"] })}
            >
              <option value="walk">Walk</option>
              <option value="bounce">Bounce</option>
              <option value="float">Float</option>
              <option value="still">Still / GIF only</option>
            </Select>
          </Field>

          <Field label="Bar thickness" hint="Pixels · current default is 4">
            <Input
              type="number"
              min={1}
              max={20}
              step={1}
              value={settings.progressThickness ?? 4}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                onChange({ progressThickness: Math.min(20, Math.max(1, Math.round(value))) });
              }}
            />
          </Field>

          <Field label="Or any character" hint="Anything you can type — an emoji, a letter, a symbol">
            <Input
              value={settings.progressMascot}
              onChange={(event) => onChange({ progressMascot: event.target.value.slice(0, 4), progressMascotMedia: undefined })}
              placeholder="🐛"
            />
          </Field>

          <Field label="Or a picture" hint="A GIF keeps animating, so it can carry its own walk">
            <MediaDropZone
              media={settings.progressMascotMedia}
              onChange={(progressMascotMedia) => onChange({ progressMascotMedia })}
              label="Mascot image"
            />
          </Field>
          {settings.progressMascotMedia && (
            <div className="flex items-center gap-3 rounded-lg bg-ink-950/60 p-2">
              <span className="grid h-8 w-8 shrink-0 place-items-center">
                <MascotFigure character={settings.progressMascot} media={settings.progressMascotMedia} motion={settings.progressMascotMotion} size={32} />
              </span>
              <p className="text-xs text-ink-500">Applied mascot size and fit. The picture replaces the character; remove it to go back.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
