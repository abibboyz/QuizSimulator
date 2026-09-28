"use client";

import type { ElementMotion, EnterEffect, ExitEffect, MotionEasing } from "@/types/quiz";
import { Field, Input, Select } from "@/components/ui/Field";
import { EASING_OPTIONS, ENTER_EFFECTS, EXIT_EFFECTS } from "@/lib/stageMotion";
import { STAGE_MOTION } from "@/lib/playTiming";

interface Props {
  element: "question" | "answers";
  value: ElementMotion;
  onChange: (next: ElementMotion) => void;
  /** Prefix for accessible names, e.g. "Quiz" or "This question's". */
  scope: string;
  /** One column, for the narrow settings sidebar. */
  stacked?: boolean;
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
}

/**
 * Entrance, exit, duration, easing (and stagger for answers) for one element.
 * `default` keeps today's look; the other fields only matter for custom effects.
 */
export function MotionFields({ element, value, onChange, scope, stacked = false }: Props) {
  const name = element === "question" ? "question" : "answer";
  const custom = value.enter !== "default" || value.exit !== "default";
  const enterEffects = ENTER_EFFECTS.filter((e) => element === "question" || !e.questionOnly);

  return (
    <div className={`grid grid-cols-1 gap-3 ${stacked ? "" : "sm:grid-cols-2"}`}>
      <Field label="Entrance">
        <Select
          value={value.enter}
          onChange={(event) => onChange({ ...value, enter: event.target.value as EnterEffect })}
          aria-label={`${scope} ${name} entrance`}
        >
          {enterEffects.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Exit">
        <Select
          value={value.exit}
          onChange={(event) => onChange({ ...value, exit: event.target.value as ExitEffect })}
          aria-label={`${scope} ${name} exit`}
        >
          {EXIT_EFFECTS.map((e) => (
            <option key={e.id} value={e.id}>
              {e.label}
            </option>
          ))}
        </Select>
      </Field>
      {custom && (
        <>
          <Field label="Duration (ms)">
            <Input
              type="number"
              min={STAGE_MOTION.minDurationMs}
              max={STAGE_MOTION.maxDurationMs}
              step={50}
              value={value.durationMs}
              onChange={(event) =>
                onChange({
                  ...value,
                  durationMs: clampInt(
                    event.target.value,
                    STAGE_MOTION.minDurationMs,
                    STAGE_MOTION.maxDurationMs,
                    value.durationMs,
                  ),
                })
              }
              aria-label={`${scope} ${name} animation duration in milliseconds`}
            />
          </Field>
          <Field label="Easing">
            <Select
              value={value.easing}
              onChange={(event) => onChange({ ...value, easing: event.target.value as MotionEasing })}
              aria-label={`${scope} ${name} easing`}
            >
              {EASING_OPTIONS.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </Select>
          </Field>
          {element === "answers" && (
            <Field label="Stagger (ms)" hint="Delay between tiles.">
              <Input
                type="number"
                min={0}
                max={STAGE_MOTION.maxStaggerMs}
                step={5}
                value={value.staggerMs}
                onChange={(event) =>
                  onChange({
                    ...value,
                    staggerMs: clampInt(event.target.value, 0, STAGE_MOTION.maxStaggerMs, value.staggerMs),
                  })
                }
                aria-label={`${scope} answer stagger in milliseconds`}
              />
            </Field>
          )}
        </>
      )}
    </div>
  );
}
