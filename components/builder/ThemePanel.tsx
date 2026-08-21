"use client";

import type { BgImageFit, Theme } from "@/types/quiz";
import { BG_ANIMATIONS, FONT_CHOICES, THEME_PRESETS, getPreset, readableTextOn } from "@/lib/themes";
import { Field, Input } from "@/components/ui/Field";
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

export function ThemePanel({ theme, onChange }: Props) {
  return (
    <div className="space-y-5">
      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Palette</span>
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
                  // has already chosen one deliberately for this quiz.
                  onChange({
                    ...theme,
                    preset: preset.id,
                    accent: preset.accent,
                    surface: preset.surface,
                    bgAnimation: theme.bgAnimation === getPreset(theme.preset).defaultBg ? preset.defaultBg : theme.bgAnimation,
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
      </div>

      <Field label="Accent colour">
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

      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Background</span>
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
      </div>

      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Question font</span>
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
      </div>

      <Field label="Background image" hint="GIFs keep animating. Sits behind the animation above.">
        <MediaDropZone media={theme.bgImage} onChange={(bgImage) => onChange({ ...theme, bgImage })} label="Background image" />
      </Field>

      {theme.bgImage && (
        <>
          <div>
            <span className="mb-2 block text-xs font-semibold uppercase tracking-widest text-ink-400">Image fit</span>
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
          </div>

          <Field label={`Dim image · ${Math.round(theme.bgImageDim * 100)}%`} hint="Darkens the picture so the question stays readable.">
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
    </div>
  );
}
