/**
 * Sizing for canvases that follow their laid-out box (RevealPicture).
 *
 * The rule that keeps them stable: the CSS box is decided by layout alone
 * (width + aspect-ratio, or the parent it fills), and the canvas is taken out
 * of flow so its backing store can never feed back into that box. The backing
 * store is then derived from the box, one way only.
 *
 * Before this, the preview canvas sat in flow: its CSS height came from the
 * backing store's aspect ratio, which was rounded from the measured CSS size,
 * which a ResizeObserver fed straight back in. Each round trip rounded the
 * width down and the height up, so the cover grew by about a pixel a frame.
 *
 * Runtime imports stay relative so `node --test` can load this.
 */

/** Devices above 3× gain nothing visible and cost a lot of fill. */
export const MAX_CANVAS_DPR = 3;

/** Backing-store pixels for a CSS box at a device pixel ratio. Never 0 (a 0×0 canvas can't be drawn to). */
export function canvasBackingSize(cssWidth: number, cssHeight: number, dpr: number): { width: number; height: number } {
  const ratio = Number.isFinite(dpr) && dpr > 0 ? Math.min(MAX_CANVAS_DPR, dpr) : 1;
  const w = Number.isFinite(cssWidth) ? Math.max(0, cssWidth) : 0;
  const h = Number.isFinite(cssHeight) ? Math.max(0, cssHeight) : 0;
  return { width: Math.max(1, Math.round(w * ratio)), height: Math.max(1, Math.round(h * ratio)) };
}

/**
 * The CSS height of a box `width` wide at `aspect` (w / h). A function of the
 * layout inputs only: it deliberately takes nothing from the canvas.
 */
export function aspectBoxHeight(width: number, aspect: number): number {
  const a = Number.isFinite(aspect) && aspect > 0 ? aspect : 4 / 3;
  return Math.max(0, width) / a;
}
