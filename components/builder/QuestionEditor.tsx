"use client";

import { useEffect } from "react";
import type { Cue, CueSlot, Question, QuestionKind, QuestionLayout, Quiz, Theme } from "@/types/quiz";
import { convertKind } from "@/lib/factory";
import { imageFromTransfer, MediaError, putImage } from "@/lib/media";
import { optionPalette } from "@/lib/themes";
import { themeAgeBand } from "@/lib/ageBands";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { ColorSwatch } from "@/components/ui/ColorSwatch";
import { MediaDropZone } from "@/components/builder/MediaDropZone";
import { OptionList } from "@/components/builder/OptionList";
import { CueEditor, describeCue } from "@/components/builder/CueEditor";
import { CUE_SLOT_LABELS, PER_QUESTION_CUE_SLOTS } from "@/lib/cues";
import { AnimationSection } from "@/components/builder/AnimationSection";

interface Props {
  quiz: Quiz;
  question: Question;
  index: number;
  onChange: (question: Question) => void;
  /** Text colours are theme-wide, so the swatches here patch the theme. */
  onChangeTheme: (theme: Theme) => void;
}

const KINDS: { id: QuestionKind; label: string }[] = [
  { id: "multiple-choice", label: "Multiple choice" },
  { id: "true-false", label: "True / False" },
  { id: "multi-select", label: "Pick all that apply" },
  { id: "image-choice", label: "Image" },
  { id: "reveal", label: "Reveal (hidden picture)" },
];

const LAYOUTS: { id: QuestionLayout; label: string; hint: string }[] = [
  { id: "grid", label: "Grid", hint: "Two columns of answer tiles" },
  { id: "list", label: "List", hint: "One answer per row" },
  { id: "image-top", label: "Image first", hint: "Picture above the question" },
  { id: "big-text", label: "Big type", hint: "Oversized prompt, best for True/False" },
];

export function QuestionEditor({ quiz, question, index, onChange, onChangeTheme }: Props) {
  const { theme } = quiz;
  const setTheme = (patch: Partial<Theme>) => onChangeTheme({ ...theme, ...patch });
  const ageBand = themeAgeBand(theme);
  const tileColors = optionPalette(ageBand).map((style) => style.bg);

  const setCue = (slot: CueSlot, cue: Cue | null | undefined) => {
    const cues = { ...question.cues };
    // Deleting the key is what "inherit" *is* — resolution checks for the key's
    // presence, so storing undefined would still read as an override.
    if (cue === undefined) delete cues[slot];
    else cues[slot] = cue;
    onChange({ ...question, cues: Object.keys(cues).length ? cues : undefined });
  };

  // Paste an image from the clipboard straight onto the question. This is the
  // difference between adding twenty screenshots comfortably and giving up.
  useEffect(() => {
    // Image questions paste onto their own grid, which has its own listener.
    if (question.kind === "image-choice") return;

    const onPaste = async (event: ClipboardEvent) => {
      const file = imageFromTransfer(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      try {
        onChange({ ...question, media: await putImage(file) });
      } catch (e) {
        if (!(e instanceof MediaError)) throw e;
      }
    };

    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [question, onChange]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-400">Question {index + 1}</h2>
        <Select
          value={question.kind}
          onChange={(event) => onChange(convertKind(question, event.target.value as QuestionKind))}
          className="w-auto"
          aria-label="Question type"
        >
          {KINDS.map((kind) => (
            <option key={kind.id} value={kind.id}>
              {kind.label}
            </option>
          ))}
        </Select>
      </header>

      <Field
        label="Prompt"
        action={
          <ColorSwatch
            label="Question text colour"
            value={theme.promptColor}
            fallback="#e9ebf4"
            onChange={(promptColor) => setTheme({ promptColor })}
          />
        }
      >
        <Textarea
          value={question.prompt}
          onChange={(event) => onChange({ ...question, prompt: event.target.value })}
          placeholder="What do you want to ask?"
          aria-label="Prompt"
          rows={2}
        />
      </Field>

      {/* A Reveal question's picture is the thing being revealed, so it lives
          with the rest of the reveal settings below. */}
      {question.kind !== "reveal" && (
      <Field
        label={question.kind === "image-choice" ? "Prompt image" : "Image"}
        hint={
          question.kind === "image-choice"
            ? "Optional picture above the question. The grid below is the set of images players see."
            : "Drag one in, click to browse, or just paste from your clipboard."
        }
      >
        <MediaDropZone media={question.media} onChange={(media) => onChange({ ...question, media })} />
      </Field>
      )}

      <OptionList
        question={question}
        onChange={onChange}
        theme={theme}
        action={
          <ColorSwatch
            label="Answer text colour"
            value={theme.optionTextColor}
            fallback="#ffffff"
            onChange={(optionTextColor) => setTheme({ optionTextColor })}
            contrastAgainst={tileColors}
          />
        }
      />

      {question.kind === "image-choice" && (
        <Field label="Tile gap" hint="Pixels between image tiles. Default 12.">
          <Input
            type="number"
            min={0}
            max={48}
            value={question.optionGap ?? 12}
            onChange={(event) => {
              const raw = Number(event.target.value);
              const clamped = Number.isFinite(raw) ? Math.min(48, Math.max(0, Math.round(raw))) : 12;
              onChange({ ...question, optionGap: clamped });
            }}
            aria-label="Gap between image tiles in pixels"
          />
        </Field>
      )}

      <Field
        label="Explanation"
        hint="Shown after the answer is revealed. Optional."
        action={
          <ColorSwatch
            label="Explanation text colour"
            value={theme.explanationColor}
            fallback="#c7cbdd"
            onChange={(explanationColor) => setTheme({ explanationColor })}
          />
        }
      >
        <Textarea
          value={question.explanation ?? ""}
          onChange={(event) => onChange({ ...question, explanation: event.target.value })}
          placeholder="Why is that the answer?"
          aria-label="Explanation"
          rows={2}
        />
      </Field>

      {question.kind !== "image-choice" && (
      <div>
        <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-ink-400">Layout</span>
        <div className="grid grid-cols-2 gap-2">
          {LAYOUTS.map((layout) => (
            <button
              key={layout.id}
              type="button"
              onClick={() => onChange({ ...question, layout: layout.id })}
              className={`focus-ring rounded-xl border px-3 py-2 text-left transition ${
                question.layout === layout.id
                  ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                  : "border-ink-700 hover:border-ink-600"
              }`}
            >
              <span className="block text-sm font-semibold text-ink-100">{layout.label}</span>
              <span className="block text-[11px] text-ink-500">{layout.hint}</span>
            </button>
          ))}
        </div>
      </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Timer" hint={`Quiz default: ${quiz.settings.timerSeconds ?? "none"}`}>
          <Input
            type="number"
            min={0}
            max={600}
            value={question.timerSeconds ?? ""}
            placeholder="Use default"
            onChange={(event) => {
              const raw = event.target.value;
              onChange({
                ...question,
                timerSeconds: raw === "" ? undefined : Number(raw) === 0 ? null : Number(raw),
              });
            }}
          />
        </Field>

        <Field label="Points" hint={`Quiz default: ${quiz.settings.pointsBase}`}>
          <Input
            type="number"
            min={0}
            max={100000}
            step={100}
            value={question.points ?? ""}
            placeholder="Use default"
            onChange={(event) => {
              const raw = event.target.value;
              onChange({ ...question, points: raw === "" ? undefined : Number(raw) });
            }}
          />
        </Field>
      </div>

      <AnimationSection quiz={quiz} question={question} onChange={onChange} />

      <div className="space-y-2 rounded-2xl border border-ink-700 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Motion &amp; sound</h3>
        <p className="text-xs text-ink-500">
          This question only. Leave a row on the quiz default to inherit it.
        </p>

        {PER_QUESTION_CUE_SLOTS.map((slot) => (
          <CueEditor
            key={slot}
            label={CUE_SLOT_LABELS[slot].label}
            hint={CUE_SLOT_LABELS[slot].hint}
            cue={question.cues?.[slot]}
            inherits={describeCue(quiz.settings.cues?.[slot])}
            onChange={(cue) => setCue(slot, cue)}
          />
        ))}
      </div>
    </div>
  );
}
