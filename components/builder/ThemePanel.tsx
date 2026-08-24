"use client";

import type { ReactNode } from "react";
import type { BgImageFit, Theme } from "@/types/quiz";
import {
  BG_ANIMATIONS,
  DEFAULT_CORRECT_COLOR,
  DEFAULT_WRONG_COLOR,
  FONT_CHOICES,
  THEME_PRESETS,
  getPreset,
  optionPalette,
  readableTextOn,
} from "@/lib/themes";
import { AGE_BANDS, OPTION_MARKERS, applyAgeBand, isAgeBand, optionColor, themeAgeBand } from "@/lib/ageBands";
import { Field, Input } from "@/components/ui/Field";
import { ColorSwatch } from "@/components/ui/ColorSwatch";
import { MediaDropZone } from "@/components/builder/MediaDropZone";

const FITS: { id: BgImageFit; label: string }[] = [
  { id: "cover", label: "Fill" },
  { id: "contain", label: "Fit" },
  { id: "tile", label: "Tile" },
];

interface Props {
  theme: Theme;
  onChange: (theme: Theme) => void;
}

/**
 * Theme controls, grouped by the thing they affect rather than by the order
 * they were added. Four collapsible sections — Preset, Stage, Answers, Text —
 * so the panel opens short and you expand only the part you came for. Each
 * collapsed header still previews its current state, so nothing is hidden that
 * you'd otherwise have to open a section to check.
 */
export function ThemePanel({ theme, onChange }: Props) {
  const ageBand = themeAgeBand(theme);
  const slots = optionPalette(ageBand);
  const tileColors = slots.map((_, i) => optionColor(i, { band: ageBand, colors: theme.optionColors }));

  /** Writes one palette slot, leaving the others to fall through to the band. */
  const setSlotColor = (index: number, color: string | undefined) => {
    const next = slots.map((_, i) => theme.optionColors?.[i] ?? "");
    next[index] = color ?? "";
    onChange({ ...theme, optionColors: next.some((entry) => entry) ? next : undefined });
  };

  /** Undefined when the slots disagree, so the "all tiles" swatch reads as mixed. */
  const uniformColor =
    theme.optionColors?.length === slots.length && theme.optionColors.every((c) => c && c === theme.optionColors?.[0])
      ? theme.optionColors[0]
      : undefined;

  const setAllColors = (color: string | undefined) =>
    onChange({ ...theme, optionColors: color ? new Array(slots.length).fill(color) : undefined });

  const activePreset = THEME_PRESETS.find((p) => p.id === theme.preset);
  const presetName = ageBand ? AGE_BANDS.find((b) => b.id === ageBand)?.label : (activePreset?.label ?? "Custom");
  const fontName = FONT_CHOICES.find((f) => f.id === theme.font)?.label;
  const markerName = OPTION_MARKERS.find((m) => m.id === (theme.optionMarker ?? "shapes"))?.label;

  return (
    <div className="space-y-2">
      <Section
        title="Preset"
        summary={presetName}
        defaultOpen
        preview={<Dot color={theme.accent} />}
        hint="Start here. A preset sets everything below in one go — then fine-tune whatever you want."
      >
        <SubHeading label="By audience" />
        <div className="space-y-1.5">
          {AGE_BANDS.map((band) => {
            const active = ageBand === band.id;
            return (
              <button
                key={band.id}
                type="button"
                onClick={() => onChange(applyAgeBand(theme, band.id))}
                aria-pressed={active}
                className={`focus-ring flex w-full items-center gap-3 rounded-xl border px-3 py-2 text-left transition ${
                  active ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-ink-700 hover:border-ink-600"
                }`}
              >
                <span
                  aria-hidden
                  className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-xs"
                  style={{ background: band.tileColor, color: readableTextOn(band.tileColor) }}
                >
                  {band.optionPalette[0].shape}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink-100">{band.label}</span>
                  <span className="block text-[11px] text-ink-500">{band.blurb}</span>
                </span>
              </button>
            );
          })}
        </div>
        <Note>
          Colours only — timers, scoring, and layouts stay exactly as you set them. Every answer tile gets the one
          colour shown.
        </Note>

        <SubHeading label="Classic palettes" />
        <div className="grid grid-cols-5 gap-2">
          {THEME_PRESETS.map((preset) => {
            const active = theme.preset === preset.id;
            return (
              <button
                key={preset.id}
                type="button"
                title={preset.label}
                onClick={() =>
                  // Switching palette also moves the background, unless the user
                  // has already chosen one deliberately for this quiz. Age bands
                  // never own a background, so coming from one always keeps it.
                  onChange({
                    ...theme,
                    preset: preset.id,
                    accent: preset.accent,
                    surface: preset.surface,
                    bgAnimation:
                      !isAgeBand(theme.preset) && theme.bgAnimation === getPreset(theme.preset).defaultBg
                        ? preset.defaultBg
                        : theme.bgAnimation,
                  })
                }
                className={`focus-ring aspect-square rounded-xl border-2 transition ${
                  active ? "scale-105 border-white" : "border-transparent hover:scale-105"
                }`}
                style={{ background: `linear-gradient(135deg, ${preset.accent}, ${preset.glow})` }}
                aria-label={preset.label}
                aria-pressed={active}
              />
            );
          })}
        </div>
      </Section>

      <Section
        title="Stage"
        summary="Backdrop and accent"
        preview={
          <>
            <Dot color={theme.surface} />
            <Dot color={theme.accent} />
          </>
        }
      >
        <Field label="Stage colour" hint="The base colour behind the animation.">
          <div className="flex gap-2">
            <input
              type="color"
              value={theme.surface}
              onChange={(event) => onChange({ ...theme, surface: event.target.value })}
              className="focus-ring h-10 w-14 cursor-pointer rounded-xl border border-ink-600 bg-ink-900"
              aria-label="Pick a stage colour"
            />
            <Input
              value={theme.surface}
              onChange={(event) => onChange({ ...theme, surface: event.target.value })}
              className="flex-1 font-mono"
            />
          </div>
        </Field>

        <Field label="Accent colour" hint="Timer ring, highlights, and selected controls.">
          <div className="flex gap-2">
            <input
              type="color"
              value={theme.accent}
              onChange={(event) => onChange({ ...theme, preset: "mono", accent: event.target.value })}
              className="focus-ring h-10 w-14 cursor-pointer rounded-xl border border-ink-600 bg-ink-900"
              aria-label="Pick an accent colour"
            />
            <Input
              value={theme.accent}
              onChange={(event) => onChange({ ...theme, accent: event.target.value })}
              className="flex-1 font-mono"
            />
            <span
              className="grid w-24 place-items-center rounded-xl text-xs font-bold"
              style={{ background: theme.accent, color: readableTextOn(theme.accent) }}
            >
              Aa
            </span>
          </div>
        </Field>

        <SubHeading label="Animation" />
        <div className="grid grid-cols-2 gap-2">
          {BG_ANIMATIONS.map((bg) => (
            <button
              key={bg.id}
              type="button"
              onClick={() => onChange({ ...theme, bgAnimation: bg.id })}
              className={`focus-ring rounded-xl border px-3 py-2 text-sm font-medium transition ${
                theme.bgAnimation === bg.id
                  ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-ink-100"
                  : "border-ink-700 text-ink-300 hover:border-ink-600"
              }`}
            >
              {bg.label}
            </button>
          ))}
        </div>

        <Field label="Background image" hint="GIFs keep animating. Sits behind the animation above.">
          <MediaDropZone
            media={theme.bgImage}
            onChange={(bgImage) => onChange({ ...theme, bgImage })}
            label="Background image"
          />
        </Field>

        {theme.bgImage && (
          <>
            <SubHeading label="Image fit" />
            <div className="grid grid-cols-3 gap-2">
              {FITS.map((fit) => (
                <button
                  key={fit.id}
                  type="button"
                  onClick={() => onChange({ ...theme, bgImageFit: fit.id })}
                  className={`focus-ring rounded-xl border px-3 py-2 text-sm font-medium transition ${
                    theme.bgImageFit === fit.id
                      ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-ink-100"
                      : "border-ink-700 text-ink-300 hover:border-ink-600"
                  }`}
                >
                  {fit.label}
                </button>
              ))}
            </div>

            <Field
              label={`Dim image · ${Math.round(theme.bgImageDim * 100)}%`}
              hint="Darkens the picture so the question stays readable."
            >
              <input
                type="range"
                min={0}
                max={90}
                value={Math.round(theme.bgImageDim * 100)}
                onChange={(event) => onChange({ ...theme, bgImageDim: Number(event.target.value) / 100 })}
                className="focus-ring w-full accent-[var(--accent)]"
              />
            </Field>
          </>
        )}
      </Section>

      <Section
        title="Answers"
        summary={`${uniformColor ? "One colour" : "Per position"} · ${markerName}`}
        preview={tileColors.slice(0, 4).map((color, i) => <Dot key={i} color={color} />)}
      >
        <div className="flex items-center justify-between gap-2">
          <SubHeading label="Tile colours" flush />
          {theme.optionColors && (
            <button
              type="button"
              onClick={() => onChange({ ...theme, optionColors: undefined })}
              className="focus-ring rounded-lg px-2 py-0.5 text-xs font-semibold text-ink-400 hover:bg-ink-800 hover:text-ink-200"
            >
              Reset all
            </button>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl border border-ink-700 px-3 py-2">
          <span className="min-w-0">
            <span className="block text-sm font-medium text-ink-100">All tiles</span>
            <span className="block text-[11px] text-ink-500">
              {uniformColor ?? "Currently a different colour per answer"}
            </span>
          </span>
          <ColorSwatch
            label="Colour for every answer tile"
            value={uniformColor}
            fallback={tileColors[0]}
            onChange={setAllColors}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {slots.map((slot, index) => (
            <span
              key={slot.name}
              className="flex items-center gap-1 rounded-xl border border-ink-700 py-1 pl-2 pr-1"
              title={`Answer ${index + 1} — ${slot.name}`}
            >
              <span
                aria-hidden
                className="grid h-5 w-5 place-items-center rounded text-[11px]"
                style={{ background: tileColors[index], color: readableTextOn(tileColors[index]) }}
              >
                {slot.shape}
              </span>
              <ColorSwatch
                label={`Answer ${index + 1} tile colour`}
                value={theme.optionColors?.[index] || undefined}
                fallback={slot.bg}
                onChange={(color) => setSlotColor(index, color)}
                compact
              />
            </span>
          ))}
        </div>
        <Note>
          Applies to every question. Override a single answer from its row in the question editor. Reset all restores a
          different colour per answer position.
        </Note>

        <SubHeading label="Answer text" />
        <ColorRow
          label="Answer text"
          value={theme.optionTextColor}
          fallback="#ffffff"
          onChange={(optionTextColor) => onChange({ ...theme, optionTextColor })}
          contrastAgainst={tileColors}
          hint="Unset lets each tile pick black or white on its own."
        />

        <SubHeading label="Markers" />
        <div className="grid grid-cols-3 gap-2">
          {OPTION_MARKERS.map((option) => {
            const active = (theme.optionMarker ?? "shapes") === option.id;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onChange({ ...theme, optionMarker: option.id })}
                aria-pressed={active}
                className={`focus-ring rounded-xl border px-3 py-2 text-center transition ${
                  active ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-ink-700 hover:border-ink-600"
                }`}
              >
                <span className="block text-sm text-ink-200">{option.sample}</span>
                <span className="block text-[11px] text-ink-500">{option.label}</span>
              </button>
            );
          })}
        </div>
        <Note>
          {theme.optionMarker && theme.optionMarker !== "shapes"
            ? "Heads up: shapes are what players with red-green colour blindness use to tell answers apart."
            : "Override any single answer with your own icon or emoji in the question editor."}
        </Note>

        <SubHeading label="On reveal" />
        <div className="space-y-1.5">
          <ColorRow
            label="Correct answer"
            value={theme.correctColor}
            fallback={DEFAULT_CORRECT_COLOR}
            onChange={(correctColor) => onChange({ ...theme, correctColor })}
            hint="Green — what players expect without being told"
          />
          <ColorRow
            label="Wrong answer"
            value={theme.wrongColor}
            fallback={DEFAULT_WRONG_COLOR}
            onChange={(wrongColor) => onChange({ ...theme, wrongColor })}
            hint="Red — what players expect without being told"
          />
        </div>
        <Note>Worth changing if you&apos;ve given the resting tiles a green or red of their own.</Note>
      </Section>

      <Section
        title="Text"
        summary={fontName}
        preview={
          <>
            <Dot color={theme.promptColor ?? "#e9ebf4"} />
            <Dot color={theme.titleColor ?? "#e9ebf4"} />
          </>
        }
      >
        <SubHeading label="Question font" flush />
        <div className="grid grid-cols-3 gap-2">
          {FONT_CHOICES.map((font) => (
            <button
              key={font.id}
              type="button"
              onClick={() => onChange({ ...theme, font: font.id })}
              style={{ fontFamily: font.varName }}
              className={`focus-ring rounded-xl border px-3 py-2 text-sm font-semibold transition ${
                theme.font === font.id
                  ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-ink-100"
                  : "border-ink-700 text-ink-300 hover:border-ink-600"
              }`}
            >
              {font.label}
            </button>
          ))}
        </div>

        <SubHeading label="Colours" />
        <div className="space-y-1.5">
          <ColorRow
            label="Question text"
            value={theme.promptColor}
            fallback="#e9ebf4"
            onChange={(promptColor) => onChange({ ...theme, promptColor })}
          />
          <ColorRow
            label="Quiz title"
            value={theme.titleColor}
            fallback="#e9ebf4"
            onChange={(titleColor) => onChange({ ...theme, titleColor })}
          />
          <ColorRow
            label="Explanation"
            value={theme.explanationColor}
            fallback="#c7cbdd"
            onChange={(explanationColor) => onChange({ ...theme, explanationColor })}
          />
        </div>
      </Section>
    </div>
  );
}

/**
 * A collapsible group. Native <details> so keyboard and screen-reader support
 * come for free, and so open state survives re-renders without extra state.
 */
function Section({
  title,
  summary,
  preview,
  hint,
  defaultOpen = false,
  children,
}: {
  title: string;
  /** One-line description of the current setting, shown while collapsed. */
  summary?: string;
  /** Swatches or similar, so a collapsed section still shows where it stands. */
  preview?: ReactNode;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-2xl border border-ink-700 bg-ink-900/40">
      <summary className="focus-ring flex cursor-pointer list-none items-center gap-2 rounded-2xl px-3 py-2.5 transition hover:bg-ink-800/50 [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden
          className="text-ink-500 transition-transform duration-200 group-open:rotate-90"
        >
          ▸
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-widest text-ink-300">{title}</span>
          {summary && <span className="block truncate text-[11px] text-ink-500">{summary}</span>}
        </span>
        <span aria-hidden className="flex shrink-0 items-center gap-1 group-open:hidden">
          {preview}
        </span>
      </summary>

      <div className="space-y-3 border-t border-ink-700/70 px-3 pb-4 pt-3">
        {hint && <p className="text-xs text-ink-500">{hint}</p>}
        {children}
      </div>
    </details>
  );
}

/** Small swatch used in the collapsed-section previews. */
function Dot({ color }: { color: string }) {
  return <span className="h-4 w-4 rounded-full border border-ink-600" style={{ background: color }} />;
}

/** Divider heading inside a section. */
function SubHeading({ label, flush = false }: { label: string; flush?: boolean }) {
  return (
    <span className={`block text-xs font-semibold uppercase tracking-widest text-ink-400 ${flush ? "" : "pt-1"}`}>
      {label}
    </span>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="text-xs text-ink-500">{children}</p>;
}

/** A named colour with its current state and a swatch to change it. */
function ColorRow({
  label,
  value,
  fallback,
  onChange,
  contrastAgainst,
  hint,
}: {
  label: string;
  value: string | undefined;
  fallback: string;
  onChange: (value: string | undefined) => void;
  contrastAgainst?: string[];
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-ink-700 px-3 py-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-ink-100">{label}</span>
        <span className="block text-[11px] text-ink-500">
          {value === undefined ? (hint ?? "Following the theme") : value}
        </span>
      </span>
      <ColorSwatch
        label={`${label} colour`}
        value={value}
        fallback={fallback}
        onChange={onChange}
        contrastAgainst={contrastAgainst}
      />
    </div>
  );
}
