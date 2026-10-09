/**
 * Builder preview framing. "builder" is the original scaled-down QuestionStage
 * (draggable prompt, Show answer). "web" and "mobile" draw the video export's
 * own FrameRenderer live at the export's 16:9 / 9:16 viewports, so the preview
 * is the same pixels the export produces for that orientation.
 *
 * Pure (type-only imports) so `node --test` can load it.
 */

import type { Framing } from "@/lib/videoExport/renderer";
import type { Timeline } from "@/lib/videoExport/timeline";

export type PreviewFrame = "builder" | "web" | "mobile";

export const DEFAULT_PREVIEW_FRAME: PreviewFrame = "builder";

export const PREVIEW_FRAMES: { id: PreviewFrame; label: string; hint: string }[] = [
  { id: "builder", label: "Builder", hint: "Editable preview: drag the prompt, toggle the answer" },
  { id: "web", label: "Web 16:9", hint: "Exactly what plays and exports in web / horizontal" },
  { id: "mobile", label: "Mobile 9:16", hint: "Exactly what plays and exports in mobile / vertical" },
];

export function framingFor(frame: PreviewFrame): Framing | null {
  return frame === "web" ? "horizontal" : frame === "mobile" ? "vertical" : null;
}

/** What the framed preview loops: one question (by authored index) or the results screen. */
export type PreviewTarget = { kind: "question"; index: number } | { kind: "results" };

export interface PreviewSegment {
  start: number;
  end: number;
}

/**
 * The slice of the export timeline that shows `target`. A question runs from
 * the moment its stage mounts until the next one mounts (so its own reveal,
 * hold and exit animation are all inside); the last question runs until the
 * results take over. Out-of-range indexes clamp to the nearest question.
 */
export function previewSegment(timeline: Timeline, target: PreviewTarget): PreviewSegment {
  const runs = timeline.questions;
  if (target.kind === "results" || !runs.length) {
    return { start: timeline.results.start, end: Math.max(timeline.results.start + 1, timeline.results.end) };
  }
  const i = Math.min(runs.length - 1, Math.max(0, Math.floor(target.index)));
  const start = runs[i].mountAt;
  const end = i + 1 < runs.length ? runs[i + 1].mountAt : timeline.results.start;
  return { start, end: Math.max(start + 1, end) };
}

/** Timeline time for `elapsed` ms of looped playback through a segment. */
export function loopTime(segment: PreviewSegment, elapsed: number): number {
  const span = Math.max(1, segment.end - segment.start);
  const e = Number.isFinite(elapsed) ? elapsed : 0;
  return segment.start + (((e % span) + span) % span);
}
