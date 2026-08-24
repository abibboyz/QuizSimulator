"use client";

import { useEffect, useState } from "react";
import type { QuizSettings } from "@/types/quiz";
import { MASCOTS, PROGRESS_PULSES, PROGRESS_STYLES, QUIZ_PROGRESS_STYLES } from "@/lib/progress";
import { Field, Input, Select } from "@/components/ui/Field";
import { MediaDropZone } from "@/components/builder/MediaDropZone";
import { ProgressMeter } from "@/components/play/ProgressMeter";
import { QuizProgress } from "@/components/play/QuizProgress";

interface Props {
  settings: QuizSettings;
  onChange: (patch: Partial<QuizSettings>) => void;
}

/**
 * Picks the shape of the question timer.
 *
 * The preview runs a real looping countdown through the real meter rather than
 * showing a still: a pulse that accelerates and a mascot that walks are the
 * whole point of these settings, and neither is judgeable frozen.
 */
export function ProgressPanel({ settings, onChange }: Props) {
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

  return (
    <div className="space-y-3 rounded-2xl border border-ink-700 p-3">
      <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Question timer</h3>

      <div className="flex min-h-20 items-center justify-center rounded-xl border border-ink-800 bg-ink-950/50 px-4 py-4">
        <ProgressMeter
          fraction={fraction}
          secondsLeft={Math.ceil(fraction * total)}
          urgent={fraction <= 0.25}
          style={settings.progressStyle}
          pulse={settings.progressPulse}
          mascot={settings.progressMascot}
          mascotMedia={settings.progressMascotMedia}
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

      <div className="space-y-3 border-t border-ink-800 pt-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Quiz progress</h3>

        <div className="flex min-h-14 items-center rounded-xl border border-ink-800 bg-ink-950/50 px-4 py-3">
          <QuizProgress
            index={4}
            total={8}
            outcomes={sample}
            style={settings.quizProgressStyle}
            mascot={settings.progressMascot}
            mascotMedia={settings.progressMascotMedia}
          />
          {settings.quizProgressStyle === "none" && (
            <p className="w-full text-center text-xs text-ink-500">No progress meter</p>
          )}
        </div>

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

          <Field label="Or any character" hint="Anything you can type — an emoji, a letter, a symbol">
            <Input
              value={settings.progressMascot}
              onChange={(event) => onChange({ progressMascot: event.target.value.slice(0, 4) })}
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
            <p className="text-xs text-ink-500">The picture is used instead of the character. Remove it to go back.</p>
          )}
        </div>
      )}
    </div>
  );
}
