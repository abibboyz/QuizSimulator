"use client";

import type { TextStylePreset, TextStyleSetting } from "@/types/quiz";
import {
  CANDY_PALETTE,
  DEFAULT_OUTLINE,
  MAX_DEPTH,
  TEXT_STYLE_PRESETS,
  normalizeTextStyle,
  resolveTextStyle,
} from "@/lib/textStyle";
import { Field, Select } from "@/components/ui/Field";
import { ColorSwatch } from "@/components/ui/ColorSwatch";
import { MediaDropZone } from "@/components/builder/MediaDropZone";

interface Props {
  /** "Prompt text style" or "Answer text style" — used in labels so the two pickers stay distinguishable. */
  label: string;
  value: TextStyleSetting | undefined;
  onChange: (value: TextStyleSetting) => void;
}

/**
 * Bubbly 3D lettering for one text role (question prompt or answers). Plain is the
 * default and leaves the text exactly as before; every other preset draws through
 * the shared painter in lib/textStyle so play, preview and export match.
 */
export function TextStylePicker({ label, value, onChange }: Props) {
  const setting = normalizeTextStyle(value);
  const resolved = resolveTextStyle(setting);
  const update = (patch: Partial<TextStyleSetting>) => onChange(normalizeTextStyle({ ...setting, ...patch }));
  const custom = setting.preset === "custom";
  const custTop = resolved?.palette[0]?.[0] ?? TEXT_STYLE_PRESETS.find((p) => p.id === "custom")!.top;
  const custBottom = resolved?.palette[0]?.[1] ?? TEXT_STYLE_PRESETS.find((p) => p.id === "custom")!.bottom;

  return (
    <div className="space-y-2 rounded-xl border border-ink-700 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-ink-100">{label}</span>
        <Swatches setting={setting} />
      </div>
      <Select
        aria-label={label}
        value={setting.preset}
        onChange={(event) => update({ preset: event.target.value as TextStylePreset })}
      >
        {TEXT_STYLE_PRESETS.map((preset) => (
          <option key={preset.id} value={preset.id}>
            {preset.label}
          </option>
        ))}
      </Select>

      {custom && resolved && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <SwatchCell label={`${label} gradient top`} text="Top" value={custTop} onChange={(top) => update({ top })} />
            <SwatchCell label={`${label} gradient bottom`} text="Bottom" value={custBottom} onChange={(bottom) => update({ bottom })} />
            <SwatchCell label={`${label} outline`} text="Outline" value={resolved.outline} onChange={(outline) => update({ outline })} />
          </div>
          <Field label={`Depth · ${resolved.depth}`}>
            <input
              type="range"
              aria-label={`${label} depth`}
              min={0}
              max={MAX_DEPTH}
              step={0.5}
              value={resolved.depth}
              onChange={(event) => update({ depth: Number(event.target.value) })}
              className="w-full accent-current"
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-ink-200">
            <input type="checkbox" checked={resolved.rim} onChange={(event) => update({ rim: event.target.checked })} />
            White rim
          </label>
        </div>
      )}

      {setting.preset !== "plain" && (
        <Field label="Image fill" hint="Optional. Fills the letters with a picture instead of the gradient. GIFs keep animating.">
          <MediaDropZone compact media={setting.image} onChange={(image) => update({ image })} label={`${label} letter fill`} />
        </Field>
      )}
    </div>
  );
}

function SwatchCell({ label, text, value, onChange }: { label: string; text: string; value: string; onChange: (value: string) => void }) {
  return (
    <span className="flex flex-col items-center gap-1 text-[11px] text-ink-400">
      <ColorSwatch label={label} value={value} fallback={value} onChange={(next) => onChange(next ?? value)} />
      {text}
    </span>
  );
}

/** Tiny gradient chips previewing the preset in the row header. */
function Swatches({ setting }: { setting: TextStyleSetting }) {
  const resolved = resolveTextStyle(setting);
  if (!resolved) return <span className="text-[11px] text-ink-500">Plain</span>;
  const palette = setting.preset === "candy" ? CANDY_PALETTE.slice(0, 4) : resolved.palette;
  return (
    <span aria-hidden className="flex items-center gap-1">
      {palette.map(([top, bottom], i) => (
        <span
          key={i}
          className="h-4 w-4 rounded-full"
          style={{ background: `linear-gradient(${top}, ${bottom})`, border: `2px solid ${resolved.outline ?? DEFAULT_OUTLINE}` }}
        />
      ))}
    </span>
  );
}
