"use client";

import { useState } from "react";
import type { CueSound, Question, RevealAnimation, RevealSettings, Theme } from "@/types/quiz";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { ColorSwatch } from "@/components/ui/ColorSwatch";
import { Button } from "@/components/ui/Button";
import { MediaDropZone } from "@/components/builder/MediaDropZone";
import { RevealPicture } from "@/components/play/RevealPicture";
import {
  REVEAL_ANIMATION_IDS,
  REVEAL_ANIMATIONS,
  REVEAL_DEFAULTS,
  resolveReveal,
  revealAnswerMedia,
  revealFallbackColor,
} from "@/lib/reveal";
import { REVEAL_TIMING } from "@/lib/playTiming";
import { SOUND_IDS, SOUNDS, playCue } from "@/lib/sound";

interface Props {
  question: Question;
  theme: Theme;
  onChange: (question: Question) => void;
}

function clampNum(raw: string, min: number, max: number, fallback: number, round = true): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(max, Math.max(min, n));
  return round ? Math.round(c) : c;
}

/**
 * Everything about a Reveal question's picture: the answer picture, the cover
 * that hides it, how it comes off, and a preview that plays the real thing
 * (the same canvas drawing the stage and the video exporter use).
 */
export function RevealEditor({ question, theme, onChange }: Props) {
  const settings = resolveReveal(question);
  const info = REVEAL_ANIMATIONS[settings.animation];
  const [run, setRun] = useState<number | null>(null);
  const correct = question.options.find((option) => option.correct) ?? question.options[0];
  const answerMedia = correct ? revealAnswerMedia(question, correct) : undefined;

  // Stores only what's set: a partial resolved against defaults on load.
  const patch = (next: Partial<RevealSettings>) => {
    const merged: Partial<RevealSettings> = { ...question.reveal, ...next };
    for (const key of Object.keys(merged) as (keyof RevealSettings)[]) {
      if (merged[key] === undefined) delete merged[key];
    }
    onChange({ ...question, reveal: merged });
  };

  // Changing how it reveals replays the preview straight away.
  const revealKey =
    run === null
      ? null
      : `${run}|${settings.animation}|${settings.durationMs}|${settings.tiles}|${settings.zoom}|${settings.focusX}|${settings.focusY}|${settings.coverFallback}`;

  return (
    <div className="space-y-4">
      <Field
        label="Cover picture"
        hint="The same picture on every answer until the correct one is revealed. Leave empty to show “?”."
      >
        <MediaDropZone media={settings.cover} onChange={(cover) => patch({ cover })} label="Cover picture" />
      </Field>

      <div className="rounded-xl border border-ink-700 bg-ink-950/60 p-3">
        <RevealPicture
          question={{ media: answerMedia, reveal: question.reveal }}
          theme={theme}
          revealKey={revealKey}
          maxHeight="12rem"
          captionClass="text-base"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] text-ink-500">
            {answerMedia
              ? "Preview uncovers the correct answer. Every answer uses this cover."
              : "Add answer images and mark the correct one to preview."}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setRun(null)} disabled={run === null}>
              Cover
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRun((n) => (n ?? 0) + 1)}>
              ▶ Play reveal
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Reveal animation">
          <Select
            value={settings.animation}
            onChange={(event) => {
              patch({ animation: event.target.value as RevealAnimation });
              setRun((n) => (n ?? 0) + 1);
            }}
            aria-label="Reveal animation"
          >
            {REVEAL_ANIMATION_IDS.map((id) => (
              <option key={id} value={id}>
                {REVEAL_ANIMATIONS[id].label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Duration (ms)" hint={`Default ${REVEAL_DEFAULTS.durationMs}.`}>
          <Input
            type="number"
            min={REVEAL_TIMING.minMs}
            max={REVEAL_TIMING.maxMs}
            step={100}
            value={settings.durationMs}
            onChange={(event) =>
              patch({
                durationMs: clampNum(event.target.value, REVEAL_TIMING.minMs, REVEAL_TIMING.maxMs, settings.durationMs),
              })
            }
            aria-label="Reveal duration in milliseconds"
          />
        </Field>

        {info.tilesLabel && (
          <Field label={info.tilesLabel} hint={`2–16. Default ${REVEAL_DEFAULTS.tiles}.`}>
            <Input
              type="number"
              min={2}
              max={16}
              value={settings.tiles}
              onChange={(event) => patch({ tiles: clampNum(event.target.value, 2, 16, settings.tiles) })}
              aria-label={info.tilesLabel}
            />
          </Field>
        )}
        {info.usesZoom && (
          <Field label="Start zoom" hint={`How close the crop starts. Default ${REVEAL_DEFAULTS.zoom}×.`}>
            <Input
              type="number"
              min={1.2}
              max={10}
              step={0.1}
              value={settings.zoom}
              onChange={(event) => patch({ zoom: clampNum(event.target.value, 1.2, 10, settings.zoom, false) })}
              aria-label="Start zoom"
            />
          </Field>
        )}
        {info.usesFocus && (
          <Field label="Focus point" hint="Where it centres: across / down, 0–100%.">
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={Math.round(settings.focusX * 100)}
                onChange={(event) => patch({ focusX: clampNum(event.target.value, 0, 100, 50) / 100 })}
                aria-label="Focus across, percent"
              />
              <Input
                type="number"
                min={0}
                max={100}
                value={Math.round(settings.focusY * 100)}
                onChange={(event) => patch({ focusY: clampNum(event.target.value, 0, 100, 50) / 100 })}
                aria-label="Focus down, percent"
              />
            </div>
          </Field>
        )}

        {info.usesCover && !settings.cover && (
          <Field
            label="Without a cover"
            action={
              settings.coverFallback === "color" ? (
                <ColorSwatch
                  label="Cover colour"
                  value={settings.coverColor}
                  fallback={revealFallbackColor(theme.accent)}
                  onChange={(coverColor) => patch({ coverColor })}
                />
              ) : undefined
            }
          >
            <Select
              value={settings.coverFallback}
              onChange={(event) => patch({ coverFallback: event.target.value as RevealSettings["coverFallback"] })}
              aria-label="Cover fallback"
            >
              <option value="color">Solid colour with a “?”</option>
              <option value="blur">Heavily blurred picture</option>
            </Select>
          </Field>
        )}

        <Field label="Reveal sound" hint="Plays as the cover comes off, when quiz sound is on.">
          <div className="flex gap-2">
            <Select
              value={settings.sound ?? "silent"}
              onChange={(event) =>
                patch({ sound: event.target.value === "silent" ? null : (event.target.value as CueSound) })
              }
              aria-label="Reveal sound"
            >
              <option value="silent">Silent</option>
              {SOUND_IDS.filter((id) => id !== "custom").map((id) => (
                <option key={id} value={id}>
                  {SOUNDS[id].label}
                </option>
              ))}
            </Select>
            <Button
              variant="ghost"
              size="sm"
              className="h-auto shrink-0"
              disabled={!settings.sound}
              onClick={() => playCue(settings.sound)}
              aria-label="Play the reveal sound"
            >
              ▶
            </Button>
          </div>
        </Field>
      </div>

      <Field label="Caption" hint="Optional. Pops in under the picture once it's uncovered, e.g. the answer's name.">
        <Textarea
          value={question.reveal?.caption ?? ""}
          onChange={(event) => patch({ caption: event.target.value || undefined })}
          placeholder="It's Mars!"
          rows={1}
          aria-label="Reveal caption"
        />
      </Field>
    </div>
  );
}
