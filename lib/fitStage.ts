/** Uniform fit: never crop, stretch, or require a scroll bar. */
export function fitStage(width: number, height: number, contentWidth: number, contentHeight: number) {
  if (![width, height, contentWidth, contentHeight].every((value) => Number.isFinite(value) && value > 0)) return 0;
  return Math.min(width / contentWidth, height / contentHeight);
}

/** Web fills its viewport; mobile retains the authored portrait proportions. */
export function liveStageSize(width: number, height: number, contentWidth: number, contentHeight: number, portrait: boolean) {
  const scale = fitStage(width, height, contentWidth, contentHeight);
  if (!scale) return { width: 0, height: 0 };
  return portrait
    ? { width: contentWidth * scale, height: contentHeight * scale }
    : { width, height };
}
