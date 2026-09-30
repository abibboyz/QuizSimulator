"use client";

import { themeInk } from "@/lib/themeInk";

import { useEffect } from "react";
import type { Cue, CueSlot, FontChoice, Question, QuestionKind, QuestionLayout, Quiz, Theme } from "@/types/quiz";
import { convertKind } from "@/lib/factory";
import { imageFromTransfer, MediaError, putImage } from "@/lib/media";
import { FONT_GROUPS, fontFamily, optionPalette } from "@/lib/themes";
import { themeAgeBand } from "@/lib/ageBands";
import { Field, Input, Select, Textarea, Toggle } from "@/components/ui/Field";
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
  { id: "reveal", label: "Reveal (covered images)" },
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
    if (question.kind === "image-choice" || question.kind === "reveal") return;

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
          <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs text-ink-300">
            <input type="checkbox" checked={!!question.promptPlacement}
              onChange={(event) => onChange({ ...question, promptPlacement: event.target.checked ? { mode: "top", x: 50, y: 50 } : undefined })} />
            Position prompt
          </label>
          <ColorSwatch
            label="Question text colour"
            value={theme.promptColor}
            fallback={themeInk(quiz.theme)[100]}
            onChange={(promptColor) => setTheme({ promptColor })}
          />
          </div>
        }
      >
        <div className="mb-2 flex flex-wrap items-center gap-2" role="group" aria-label="Prompt formatting">
          {([['bold', 'B'], ['italic', 'I'], ['underline', 'U']] as const).map(([key, label]) => {
            const active = question.promptStyle?.[key] ?? (key === 'bold');
            return <button key={key} type="button" aria-label={key} aria-pressed={active}
              className={`focus-ring rounded-lg border px-3 py-1.5 text-sm ${active ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-ink-700"}`}
              style={{ fontWeight: key === 'bold' ? 700 : undefined, fontStyle: key === 'italic' ? 'italic' : undefined, textDecoration: key === 'underline' ? 'underline' : undefined }}
              onClick={() => onChange({ ...question, promptStyle: { ...question.promptStyle, [key]: !active } })}>{label}</button>;
          })}
          <Select aria-label="Question font" className="w-auto" value={question.promptStyle?.font ?? ""}
            onChange={(event) => onChange({ ...question, promptStyle: { ...question.promptStyle, font: (event.target.value || undefined) as FontChoice | undefined } })}>
            <option value="">Use global font</option>
            {FONT_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.choices.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</optgroup>)}
          </Select>
        </div>
        {question.promptStyle?.font === "custom" && <Input className="mb-2" aria-label="Custom question font name" placeholder="Installed font name (fallback if unavailable)"
          value={question.promptStyle.customFont ?? ""} onChange={(event) => onChange({ ...question, promptStyle: { ...question.promptStyle, customFont: event.target.value } })} />}
        <Textarea
          style={{ fontWeight: question.promptStyle?.bold === false ? 400 : 700, fontStyle: question.promptStyle?.italic ? "italic" : "normal", textDecoration: question.promptStyle?.underline ? "underline" : "none", fontFamily: question.promptStyle?.font ? fontFamily(question.promptStyle.font, question.promptStyle.customFont) : fontFamily(theme.font, theme.customFont) }}
          value={question.prompt}
          onChange={(event) => onChange({ ...question, prompt: event.target.value })}
          placeholder="What do you want to ask?"
          aria-label="Prompt"
          rows={2}
        />
      </Field>

      {question.promptPlacement && (
        <Field label="Prompt position" hint="Choose Over question image, then drag in Live preview. Requires a question image; otherwise the prompt stays at the top. Arrow keys also move it.">
          <Select value={question.promptPlacement.mode} onChange={(event) => onChange({ ...question, promptPlacement: { ...question.promptPlacement!, mode: event.target.value as "top" | "overlay" | "bottom" } })}>
            <option value="top">Top (current position)</option>
            <option value="overlay">Over question image · draggable</option>
            <option value="bottom">Bottom · below question image</option>
          </Select>
        </Field>
      )}

      <div className="space-y-3 rounded-2xl border border-ink-700 p-3">
        <Toggle label="Use a screen background for this question" checked={question.background?.enabled ?? false}
          hint="Replaces the whole-screen background for this question only. Other questions keep their own settings. Turn off to use the quiz background."
          onChange={(enabled) => onChange({ ...question, background: { image: quiz.theme.bgImage, fit: quiz.theme.bgImageFit, dim: quiz.theme.bgImageDim, ...question.background, enabled } })} />
        {question.background?.enabled && <>
          <MediaDropZone label="Screen background image (this question only)" media={question.background.image}
            onChange={(image) => onChange({ ...question, background: { ...question.background!, image } })} />
          <Field label="Background image fit">
            <Select value={question.background.fit} onChange={(event) => onChange({ ...question, background: { ...question.background!, fit: event.target.value as "cover" | "contain" | "tile" } })}>
              <option value="cover">Cover</option><option value="contain">Contain</option><option value="tile">Tile</option>
            </Select>
          </Field>
          <Field label={`Dim image · ${Math.round(question.background.dim * 100)}%`}>
            <input type="range" min={0} max={90} value={question.background.dim * 100} className="w-full"
              onChange={(event) => onChange({ ...question, background: { ...question.background!, dim: Number(event.target.value) / 100 } })} />
          </Field>
        </>}
      </div>

      {/* A Reveal question's picture is the thing being revealed, but we allow an explicit
          question image so users can place prompts over it if they wish. */}
      <Field
        label="Question image"
        hint={
          question.kind === "image-choice"
            ? "Separate from the screen background. The grid below contains the answer images."
            : "Separate from the screen background. Choose Over question image to place the prompt on this picture."
        }
      >
        <MediaDropZone media={question.media} onChange={(media) => onChange({ ...question, media })} />
      </Field>

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

      {(question.kind === "image-choice" || question.kind === "reveal") && (
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
            fallback={themeInk(quiz.theme)[200]}
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

      {question.kind !== "image-choice" && question.kind !== "reveal" && (
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

      {/* Keyed so preview state (a played reveal, a replay counter) never carries over to another question. */}
      <AnimationSection key={question.id} quiz={quiz} question={question} onChange={onChange} />

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
