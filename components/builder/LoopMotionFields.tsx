"use client";

import { useState } from "react";
import type { LoopMotion } from "@/types/quiz";
import { DEFAULT_LOOP, LOOP_SPEEDS, LOOP_STYLES, normalizeLoop } from "@/lib/loopMotion";
import { Field, Select } from "@/components/ui/Field";
import { LoopMotion as Preview } from "@/components/play/LoopMotion";

export function LoopMotionFields({ label, value, inherited, onChange }: {
  label: string; value?: LoopMotion; inherited?: LoopMotion; onChange: (value: LoopMotion | undefined) => void;
}) {
  const [replay, setReplay] = useState(0);
  const resolved = normalizeLoop(value ?? inherited ?? DEFAULT_LOOP);
  const local = !inherited || !!value;
  const describe = (motion: LoopMotion) => [motion.style, ...(motion.style !== "none" && motion.secondary && motion.secondary !== "none" ? [motion.secondary] : [])]
    .map((id) => LOOP_STYLES.find((s) => s.id === id)?.label ?? "Off").join(" + ");
  return <div className="space-y-3 rounded-xl border border-ink-700 p-3">
    <Field label={label}>
      <Select aria-label={`${label} style`} value={!value && inherited ? "inherit" : resolved.style}
        onChange={(event) => onChange(event.target.value === "inherit" ? undefined : { ...resolved, style: event.target.value as LoopMotion["style"] })}>
        {inherited && <option value="inherit">Inherit ({describe(inherited)})</option>}
        {LOOP_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
      </Select>
    </Field>
    {resolved.style !== "none" && <>
      {local && <>
        <Field label="Playback">
          <Select aria-label={`${label} playback`} value={resolved.playback ?? "loop"}
            onChange={(event) => onChange({ ...resolved, playback: event.target.value as LoopMotion["playback"] })}>
            <option value="loop">Keep repeating · while on screen</option>
            <option value="hold">Move once, then stay</option>
          </Select>
        </Field>
        <Field label="Combine with" hint="Both effects play together. Choose None for just the first effect.">
          <Select aria-label={`${label} combine with`} value={resolved.secondary ?? "none"}
            onChange={(event) => onChange({ ...resolved, secondary: event.target.value as LoopMotion["style"] })}>
            <option value="none">None · single effect</option>
            {LOOP_STYLES.filter((s) => s.id !== "none").map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
          </Select>
        </Field>
        <Field label="Direction">
          <Select aria-label={`${label} direction`} value={resolved.direction ?? "same"}
            onChange={(event) => onChange({ ...resolved, direction: event.target.value as LoopMotion["direction"] })}>
            <option value="same">Same direction</option><option value="reverse">Reverse direction</option>
            <option value="alternate">Opposite directions · alternating answers</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Speed"><Select aria-label={`${label} speed`} value={resolved.durationMs} onChange={(event) => onChange({ ...resolved, durationMs: Number(event.target.value) })}>
            {LOOP_SPEEDS.map((speed) => <option key={speed.durationMs} value={speed.durationMs}>{speed.label}</option>)}
          </Select></Field>
          <Field label={`Movement · ${resolved.amount}`}><input aria-label={`${label} movement`} className="w-full" type="range" min={1} max={10} value={resolved.amount}
            onChange={(event) => onChange({ ...resolved, amount: Number(event.target.value) })} /></Field>
        </div>
        <label className="flex items-center gap-2 text-xs text-ink-300"><input type="checkbox" checked={resolved.pauseOnInteract ?? false}
          onChange={(event) => onChange({ ...resolved, pauseOnInteract: event.target.checked })} />Pause on hover or keyboard focus</label>
      </>}
      <p className="text-xs text-ink-500">{resolved.playback === "hold" ? "Moves once, then stays" : "Repeats continuously"}: {describe(resolved)}. Shuffle dance moves each answer near its own place.</p>
      {resolved.playback === "hold" && <button type="button" className="focus-ring rounded-lg border border-ink-700 px-2 py-1 text-xs" onClick={() => setReplay((value) => value + 1)}>Replay movement preview</button>}
      <div className="grid grid-cols-2 gap-4 px-2 py-3" aria-label={`${label} continuous preview`}>
        {[0, 1].map((index) => <Preview key={`${index}-${replay}`} value={resolved} index={index}><div className="rounded-lg bg-[var(--accent-soft)] p-2 text-center text-sm">{index === 0 ? "🦋" : "⭐"} Answer {index + 1}</div></Preview>)}
      </div>
    </>}
  </div>;
}
