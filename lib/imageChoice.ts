/** Image questions. One correct picture, up to 100, shown as a numbered
 *  picture grid — the same idea as a flag round — with no answer bullets. */

export const MAX_IMAGE_OPTIONS = 100;
export const DEFAULT_IMAGE_GAP = 12;

/**
 * Columns for the picture grid. A pair sits side by side, a round of 12 lands
 * on three columns, and a full set of 100 packs into a small ten-across grid.
 * Each tile then shares the row evenly, so fewer pictures means bigger ones.
 */
export function imageChoiceColumns(count: number): number {
  const n = Math.max(1, Math.floor(count));
  if (n <= 3) return n;
  return Math.min(n, Math.round(Math.sqrt(n)));
}

export function imageChoiceGridStyle(count: number, gapPx: number): {
  display: "grid";
  gap: string;
  gridTemplateColumns: string;
} {
  return {
    display: "grid",
    gap: `${gapPx}px`,
    gridTemplateColumns: `repeat(${imageChoiceColumns(count)}, minmax(0, 1fr))`,
  };
}
