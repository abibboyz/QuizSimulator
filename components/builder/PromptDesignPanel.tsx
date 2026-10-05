"use client";

import type { Question, Theme } from "@/types/quiz";
import { ColorSwatch } from "@/components/ui/ColorSwatch";
import { MediaDropZone } from "@/components/builder/MediaDropZone";
import { LETTER_SHAPES } from "@/lib/promptDesign";
import { WORD_ART_STYLES, wordArtInk, wordArtStyleOf } from "@/lib/promptText";

type Style = NonNullable<Question["promptStyle"]>;

const BOX_SHAPES = ["none", "rectangle", "card", "pill", "speech", "banner", "circle"] as const;
const TEXT_SHAPES = ["straight", "arc-up", "arc-down", "circle", "wave"] as const;
const PARAGRAPH_SHAPES = ["normal", "narrow", "wide", "diamond", "oval"] as const;
const FILL_EFFECTS = ["solid", "gradient", "metallic", "chalk"] as const;
const UNITS = ["all", "letter", "word", "sentence", "paragraph"] as const;
const EFFECTS = ["appear", "fade", "rise", "drop", "slide-left", "slide-right", "zoom", "pop", "flip", "bounce", "float", "pulse"] as const;

export function PromptDesignPanel({ question, theme, onChange }: { question: Question; theme: Theme; onChange: (question: Question) => void }) {
  const style = question.promptStyle ?? {};
  const box = style.box ?? { shape: "none" as const };
  const animation = style.textAnimation;
  const art = wordArtInk(theme.accent, theme.surface, wordArtStyleOf(style.wordArt) ?? "classic");
  const patch = (change: Partial<Style>) => onChange({ ...question, promptStyle: { ...style, ...change } });
  const patchBox = (change: Partial<NonNullable<Style["box"]>>) => patch({ box: { ...box, ...change } });
  const patchAnimation = (change: Partial<NonNullable<Style["textAnimation"]>>) => patch({ textAnimation: { unit: "all", effect: "fade", durationMs: 450, delayMs: 0, staggerMs: 180, ...animation, ...change } });

  return <div className="space-y-3 rounded-xl border border-ink-700 bg-ink-900/40 p-2">
    <p className="px-1 text-[11px] text-ink-400">Design once. Preview, play, host and video use the same typography and proportions.</p>
    <details className="rounded-lg border border-ink-700 p-2" open>
      <summary className="cursor-pointer text-xs font-semibold text-ink-200">Word Art &amp; text finish</summary>
    <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <label className="text-xs text-ink-300">Text fill
        <select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={style.fillEffect ?? "solid"} onChange={(event) => patch({ fillEffect: event.target.value as Style["fillEffect"] })}>
          {FILL_EFFECTS.map((effect) => <option key={effect} value={effect}>{effect}</option>)}
        </select>
      </label>
      <label className="text-xs text-ink-300">Text effect
        <select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={wordArtStyleOf(style.wordArt) ?? "none"} onChange={(event) => patch({ wordArt: event.target.value === "none" ? undefined : event.target.value as Style["wordArt"] })}>
          <option value="none">None</option>{WORD_ART_STYLES.map((effect) => <option key={effect.id} value={effect.id}>{effect.label}</option>)}
        </select>
      </label>
      {wordArtStyleOf(style.wordArt) && <div className="flex flex-wrap items-center gap-3 rounded-lg bg-ink-800/40 p-2 sm:col-span-2">
        {([['fill', 'Text'], ['stroke', 'Outline'], ['shadow', 'Shadow']] as const).map(([key, label]) => <span key={key} className="flex items-center gap-2 text-xs text-ink-300">{label}<ColorSwatch label={`Word Art ${label.toLowerCase()} colour`} value={style.wordArtColors?.[key]} fallback={art[key]} onChange={(value) => patch({ wordArtColors: { ...style.wordArtColors, [key]: value } })} /></span>)}
        <button type="button" className="focus-ring rounded px-2 py-1 text-xs text-ink-400 underline" onClick={() => patch({ wordArtColors: undefined })}>Default colours</button>
      </div>}
      <label className="text-xs text-ink-300">Character spacing · {style.letterSpacing ?? 0}px
        <input className="mt-2 w-full accent-[var(--accent)]" type="range" min="-2" max="8" step="0.5" value={style.letterSpacing ?? 0} onChange={(event) => patch({ letterSpacing: Number(event.target.value) })} />
      </label>
      <label className="text-xs text-ink-300">Line spacing · {style.lineSpacing ?? 1.375}×
        <input className="mt-2 w-full accent-[var(--accent)]" type="range" min="1" max="2" step="0.025" value={style.lineSpacing ?? 1.375} onChange={(event) => patch({ lineSpacing: Number(event.target.value) })} />
      </label>
    </div>
    </details>

    <details className="rounded-lg border border-ink-700 p-2">
      <summary className="cursor-pointer text-xs font-semibold text-ink-200">Shape format</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
      <div role="group" aria-label="Prompt shape" className="grid grid-cols-4 gap-1 sm:col-span-2">
        {BOX_SHAPES.map((shape) => {
          const name = ({ none: "Text only", rectangle: "Rectangle", card: "Rounded", pill: "Pill", speech: "Callout", banner: "Banner", circle: "Circle" } as Record<typeof shape, string>)[shape];
          return <button key={shape} type="button" aria-label={`${name} prompt shape`} aria-pressed={box.shape === shape}
            className={`focus-ring grid justify-items-center gap-1 rounded-lg border px-1 py-2 text-[10px] ${box.shape === shape ? "border-[var(--accent-line)] bg-[var(--accent-soft)] text-ink-100" : "border-ink-700 text-ink-300 hover:bg-ink-800"}`}
            onClick={() => patchBox({ shape })}>
            <span aria-hidden className={`relative grid h-8 w-11 place-items-center text-xs font-bold ${shape === "none" ? "" : "border border-current"}`}
              style={{ borderRadius: shape === "pill" || shape === "circle" ? 999 : shape === "card" ? 7 : shape === "rectangle" ? 0 : 3,
                width: shape === "circle" ? 32 : 44,
                clipPath: shape === "banner" ? "polygon(10% 0, 90% 0, 100% 50%, 90% 100%, 10% 100%, 0 50%)" : undefined }}>
              {shape === "none" ? "Aa" : "A"}
              {shape === "speech" && <span className="absolute -bottom-1 left-2 h-2 w-2 rotate-45 border-b border-r border-current bg-ink-900" />}
            </span>
            {name}
          </button>;
        })}
      </div>
      {box.shape !== "none" && <>
      <label className="text-xs text-ink-300 sm:col-span-2">Shape fill
        <select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={box.backgroundStyle ?? "solid"} onChange={(event) => patchBox({ backgroundStyle: event.target.value as NonNullable<Style["box"]>["backgroundStyle"] })}>
          <option value="solid">Solid colour</option><option value="gradient">Gradient</option><option value="texture">Subtle texture</option><option value="image">Image</option>
        </select>
      </label>
      {box.backgroundStyle === "image" &&
      <div className="sm:col-span-2"><MediaDropZone label="Prompt shape picture" media={box.image} onChange={(image) => patchBox({ image })} /></div>
      }
      <ColorSwatch label="Fill colour" value={box.fill} fallback={theme.surface} onChange={(fill) => patchBox({ fill })} />
      <ColorSwatch label="Outline colour" value={box.border} fallback={theme.accent} onChange={(border) => patchBox({ border })} />
      {box.backgroundStyle === "gradient" && <>
        <ColorSwatch label="Gradient end colour" value={box.gradientTo} fallback={theme.accent} onChange={(gradientTo) => patchBox({ gradientTo })} />
        <label className="text-xs text-ink-300">Gradient direction · {box.gradientAngle ?? 135}°
          <input className="mt-2 w-full accent-[var(--accent)]" type="range" min="0" max="360" step="15" value={box.gradientAngle ?? 135} onChange={(event) => patchBox({ gradientAngle: Number(event.target.value) })} />
        </label>
      </>}
      <label className="text-xs text-ink-300">Outline weight · {box.borderWidth ?? 2}px
        <input className="mt-2 w-full accent-[var(--accent)]" type="range" min="0" max="8" step="0.5" value={box.borderWidth ?? 2} onChange={(event) => patchBox({ borderWidth: Number(event.target.value) })} />
      </label>
      <label className="text-xs text-ink-300">Outline style
        <select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={box.borderStyle ?? "solid"} onChange={(event) => patchBox({ borderStyle: event.target.value as typeof box.borderStyle })}>
          <option value="solid">Solid</option><option value="dashed">Dashed</option><option value="dotted">Dotted</option>
        </select>
      </label>
      <label className="text-xs text-ink-300">Transparency · {Math.round((1 - (box.opacity ?? 0.85)) * 100)}%
        <input className="mt-2 w-full accent-[var(--accent)]" type="range" min="0" max="100" value={Math.round((1 - (box.opacity ?? 0.85)) * 100)} onChange={(event) => patchBox({ opacity: 1 - Number(event.target.value) / 100 })} />
      </label>
      <label className="text-xs text-ink-300">Text inset · {box.padding ?? 16}px
        <input className="mt-2 w-full accent-[var(--accent)]" type="range" min="0" max="40" value={box.padding ?? 16} onChange={(event) => patchBox({ padding: Number(event.target.value) })} />
      </label>
      <label className="flex items-center gap-2 text-xs text-ink-300"><input type="checkbox" checked={box.shadow ?? false} onChange={(event) => patchBox({ shadow: event.target.checked })} /> Shape shadow</label>
      </>}
      </div>
    </details>

    <details className="rounded-lg border border-ink-700 p-2">
      <summary className="cursor-pointer text-xs font-semibold text-ink-200">Letter shapes &amp; paths</summary>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <label className="text-xs text-ink-300 sm:col-span-2">Letter sizes
          <select aria-label="Letter size shape" className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={style.letterShape ?? "uniform"} onChange={(event) => patch({ letterShape: event.target.value as Style["letterShape"] })}>
            {LETTER_SHAPES.map((shape) => <option key={shape.id} value={shape.id}>{shape.label}</option>)}
          </select>
          <span className="mt-1 block text-[11px] text-ink-400">Combine with a path below. Pinch makes both ends big and the middle small.</span>
        </label>
        <label className="text-xs text-ink-300">Path
          <select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={style.textShape ?? "straight"} onChange={(event) => patch({ textShape: event.target.value as Style["textShape"], paragraphShape: "normal" })}>
            {TEXT_SHAPES.map((shape) => <option key={shape} value={shape}>{shape.replaceAll("-", " ")}</option>)}
            {style.textShape && !TEXT_SHAPES.some((shape) => shape === style.textShape) && <option value={style.textShape}>{style.textShape.replaceAll("-", " ")}</option>}
          </select>
        </label>
        {style.textShape && style.textShape !== "straight" && <label className="text-xs text-ink-300">Bend · {style.curve ?? 50}%
          <input className="mt-2 w-full accent-[var(--accent)]" type="range" min="0" max="100" value={style.curve ?? 50} onChange={(event) => patch({ curve: Number(event.target.value) })} />
        </label>}
      </div>
      <details className="mt-2 rounded-lg border border-ink-700/70 p-2">
        <summary className="cursor-pointer text-xs text-ink-400">More transforms</summary>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-ink-300">Decorative path
            <select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={["s-curve", "zigzag", "spiral"].includes(style.textShape ?? "") ? style.textShape : "straight"} onChange={(event) => patch({ textShape: event.target.value as Style["textShape"], paragraphShape: "normal" })}>
              <option value="straight">None</option><option value="s-curve">S curve</option><option value="zigzag">Zigzag</option><option value="spiral">Spiral</option>
            </select>
          </label>
          <label className="text-xs text-ink-300">Paragraph contour
            <select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={style.paragraphShape ?? "normal"} onChange={(event) => patch({ paragraphShape: event.target.value as Style["paragraphShape"], textShape: "straight" })}>
              {PARAGRAPH_SHAPES.map((shape) => <option key={shape} value={shape}>{shape}</option>)}
            </select>
          </label>
        </div>
      </details>
    </details>

    <details className="rounded-lg border border-ink-700 p-2">
      <summary className="cursor-pointer text-xs font-semibold text-ink-200">Animation</summary>
      <div className="mt-2 space-y-2">
      <label className="flex items-center gap-2 text-sm font-semibold text-ink-100"><input type="checkbox" checked={!!animation} onChange={(event) => patch({ textAnimation: event.target.checked ? { unit: "all", effect: "fade", durationMs: 450, delayMs: 0, staggerMs: 180 } : undefined })} /> Animate prompt text</label>
      {animation && <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-ink-300">Animate text<select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={animation.unit} onChange={(event) => patchAnimation({ unit: event.target.value as typeof animation.unit })}>{UNITS.map((unit) => <option key={unit} value={unit}>{unit === "all" ? "All at once" : `By ${unit}`}</option>)}</select></label>
        <label className="text-xs text-ink-300">Effect<select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={animation.effect} onChange={(event) => patchAnimation({ effect: event.target.value as typeof animation.effect })}>{EFFECTS.map((effect) => <option key={effect} value={effect}>{({ rise: "Fly up", drop: "Drop in", "slide-left": "Fly from right", "slide-right": "Fly from left", bounce: "Bounce in place", float: "Float in place", pulse: "Pulse in place" } as Record<string, string>)[effect] ?? effect.replaceAll("-", " ")}</option>)}</select></label>
        <label className="text-xs text-ink-300">Repeat
          <select className="mt-1 w-full rounded-lg border border-ink-700 bg-ink-900 p-2 text-sm" value={animation.repeat === null ? "forever" : String(animation.repeat ?? 1)} onChange={(event) => patchAnimation({ repeat: event.target.value === "forever" ? null : Number(event.target.value) })}>
            {[1, 2, 3, 5, 10].map((count) => <option key={count} value={count}>{count === 1 ? "Once" : `${count} times`}</option>)}
            <option value="forever">Always, until next question</option>
          </select>
        </label>
        {([ ["Duration", "durationMs", 100, 2000], ["Start delay", "delayMs", 0, 3000], ["Between parts", "staggerMs", 0, 1500] ] as const).map(([label, key, min, max]) => <label key={key} className="text-xs text-ink-300">{label} · {animation[key]}ms<input className="mt-2 w-full accent-[var(--accent)]" type="range" min={min} max={max} step="10" value={animation[key]} onChange={(event) => patchAnimation({ [key]: Number(event.target.value) })} /></label>)}
      </div>}
      </div>
    </details>
  </div>;
}
