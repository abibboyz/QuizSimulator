"use client";

import { useEffect } from "react";
import type { Question, QuestionKind, QuestionLayout, Quiz } from "@/types/quiz";
import { convertKind } from "@/lib/factory";
import { imageFromTransfer, MediaError, putImage } from "@/lib/media";
import { Field, Input, Select, Textarea } from "@/components/ui/Field";
import { MediaDropZone } from "@/components/builder/MediaDropZone";
import { OptionList } from "@/components/builder/OptionList";

interface Props {
  quiz: Quiz;
  question: Question;
  index: number;
  onChange: (question: Question) => void;
}

const KINDS: { id: QuestionKind; label: string }[] = [
  { id: "multiple-choice", label: "Multiple choice" },
  { id: "true-false", label: "True / False" },
  { id: "multi-select", label: "Pick all that apply" },
];

const LAYOUTS: { id: QuestionLayout; label: string; hint: string }[] = [
  { id: "grid", label: "Grid", hint: "Two columns of answer tiles" },
  { id: "list", label: "List", hint: "One answer per row" },
  { id: "image-top", label: "Image first", hint: "Picture above the question" },
  { id: "big-text", label: "Big type", hint: "Oversized prompt, best for True/False" },
];

export function QuestionEditor({ quiz, question, index, onChange }: Props) {
  // Paste an image from the clipboard straight onto the question. This is the
  // difference between adding twenty screenshots comfortably and giving up.
  useEffect(() => {
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

      <Field label="Prompt">
        <Textarea
          value={question.prompt}
          onChange={(event) => onChange({ ...question, prompt: event.target.value })}
          placeholder="What do you want to ask?"
          rows={2}
        />
      </Field>

      <Field label="Image" hint="Drag one in, click to browse, or just paste from your clipboard.">
        <MediaDropZone media={question.media} onChange={(media) => onChange({ ...question, media })} />
      </Field>

      <OptionList question={question} onChange={onChange} />

      <Field label="Explanation" hint="Shown after the answer is revealed. Optional.">
        <Textarea
          value={question.explanation ?? ""}
          onChange={(event) => onChange({ ...question, explanation: event.target.value })}
          placeholder="Why is that the answer?"
          rows={2}
        />
      </Field>

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
    </div>
  );
}
