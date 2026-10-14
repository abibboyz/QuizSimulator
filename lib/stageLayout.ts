import type { Question, QuizSettings, ResponsiveStageLayout, StageItemPlacement, StageLayoutItem, StageLayoutView } from "@/types/quiz";

export function clampStagePlacement(value: StageItemPlacement): StageItemPlacement {
  const width = Math.min(100, Math.max(10, Number.isFinite(value.width) ? value.width : 100));
  const height = Math.min(100, Math.max(8, Number.isFinite(value.height) ? value.height : 30));
  return {
    x: Math.min(100 - width, Math.max(0, Number.isFinite(value.x) ? value.x : 0)),
    y: Math.min(100 - height, Math.max(0, Number.isFinite(value.y) ? value.y : 0)),
    width,
    height,
  };
}

export function stagePlacementFor(settings: Pick<QuizSettings, "stageLayout">, question: Pick<Question, "stageLayout">, view: StageLayoutView, item: StageLayoutItem): StageItemPlacement | null {
  const value = question.stageLayout?.[view]?.[item] ?? settings.stageLayout?.[view]?.[item];
  return value ? clampStagePlacement(value) : null;
}

export function withStagePlacement(layout: ResponsiveStageLayout | undefined, view: StageLayoutView, item: StageLayoutItem, placement: StageItemPlacement | null): ResponsiveStageLayout | undefined {
  const frame = { ...layout?.[view] };
  if (placement) frame[item] = clampStagePlacement(placement);
  else delete frame[item];
  const next = { ...layout };
  if (Object.keys(frame).length) next[view] = frame;
  else delete next[view];
  return Object.keys(next).length ? next : undefined;
}
