"use client";

import { useState } from "react";
import type { AnswerTextStyle, Theme } from "@/types/quiz";
import { FONT_GROUPS } from "@/lib/themes";
import { answerTextStyle } from "@/lib/answerPresentation";
import { ColorSwatch } from "@/components/ui/ColorSwatch";

export function AnswerTypography({ value, theme, global = false, onChange }: {
  value?: AnswerTextStyle;
  theme: Theme;
  global?: boolean;
  onChange: (style: AnswerTextStyle | undefined) => void;
}) {
  const effective = answerTextStyle(global ? { optionTextColor: theme.optionTextColor } : theme, { answerStyle: value });
  const patch = (change: Partial<AnswerTextStyle>) => onChange({ ...value, ...change });
  const label = global ? "Global answer" : "Answer";
  return <details className="rounded-xl border border-ink-700 p-3">
    <summary className="cursor-pointer text-sm font-semibold text-ink-200">{global ? "Default answer typography" : "Answer typography"}{!global && !value ? " · using quiz defaults" : ""}</summary>
    <p className="my-2 text-xs text-ink-400">{global ? "Defaults for all answer text and image captions. Individual questions can override these." : "Applies to answers and image captions on this question. Unchanged settings follow the quiz defaults."}</p>
    <div className="flex flex-wrap items-center gap-2">
      <label className="text-xs text-ink-300">Font
        <select aria-label={`${label} font`} className="ml-2 max-w-48 rounded-lg border border-ink-700 bg-ink-900 p-2" value={value?.font ?? ""} onChange={(e) => patch({ font: (e.target.value || undefined) as AnswerTextStyle["font"], customFont: undefined })}>
          <option value="">{global ? "Quiz font" : "Use quiz default"}</option>
          {FONT_GROUPS.map((group) => <optgroup key={group.label} label={group.label}>{group.choices.map((font) => <option key={font.id} value={font.id}>{font.label}</option>)}</optgroup>)}
        </select>
      </label>
      <label className="text-xs text-ink-300">Size
        <AnswerSizeInput key={value?.fontSize ?? "auto"} value={value?.fontSize} fallback={effective.fontSize} label={`${label} font size`} onChange={(fontSize) => patch({ fontSize })} />
      </label>
      {(["bold", "italic", "underline"] as const).map((key) => {
        const active = effective[key] ?? (key === "bold");
        return <button key={key} type="button" aria-label={`${label} ${key}`} aria-pressed={active}
          className={`focus-ring rounded-lg border px-3 py-2 text-sm ${active ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-ink-700"}`}
          style={{ fontWeight: key === "bold" ? 700 : undefined, fontStyle: key === "italic" ? "italic" : undefined, textDecoration: key === "underline" ? "underline" : undefined }}
          onClick={() => patch({ [key]: !active })}>{key === "bold" ? "B" : key === "italic" ? "I" : "U"}</button>;
      })}
      <ColorSwatch label={`${label} text colour`} value={value?.color} fallback={effective.color ?? "#ffffff"} onChange={(color) => patch({ color })} />
      <button type="button" className="focus-ring rounded-lg px-2 py-1 text-xs text-ink-400 underline" onClick={() => onChange(undefined)}>{global ? "Reset typography" : "Use quiz defaults"}</button>
    </div>
    {value?.font === "custom" && <input aria-label={`${label} custom font`} placeholder="Installed font name" value={value.customFont ?? ""} className="mt-2 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" onChange={(e) => patch({ customFont: e.target.value })} />}
  </details>;
}

function AnswerSizeInput({ value, fallback, label, onChange }: { value?: number; fallback?: number; label: string; onChange: (value?: number) => void }) {
  const [draft, setDraft] = useState(value === undefined ? "" : String(value));
  const commit = () => {
    if (!draft.trim()) { onChange(undefined); return; }
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) { setDraft(value === undefined ? "" : String(value)); return; }
    const size = Math.min(150, Math.max(8, Math.round(parsed)));
    setDraft(String(size));
    onChange(size);
  };
  return <input aria-label={label} type="number" min={8} max={150} placeholder={fallback ? String(fallback) : "Auto"} value={draft}
    className="ml-2 w-20 rounded-lg border border-ink-700 bg-ink-900 p-2" onChange={(event) => setDraft(event.target.value)}
    onBlur={commit} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />;
}
