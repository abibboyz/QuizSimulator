/** Uniform fit: never crop, stretch, or require a scroll bar. */
export function fitStage(width: number, height: number, contentWidth: number, contentHeight: number) {
  if (![width, height, contentWidth, contentHeight].every((value) => Number.isFinite(value) && value > 0)) return 0;
  return Math.min(width / contentWidth, height / contentHeight);
}
