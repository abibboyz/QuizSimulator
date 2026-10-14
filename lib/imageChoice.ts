import type { Question, QuizSettings } from "@/types/quiz";

/** Image questions. One correct picture, up to 100, shown as a numbered
 *  picture grid — the same idea as a flag round — with no answer bullets. */

export const MAX_IMAGE_OPTIONS = 100;
export const DEFAULT_IMAGE_GAP = 12;

export function imageAreaWidth(question: Pick<Question, "imageArea">): number {
  return Math.min(1, Math.max(0.35, question.imageArea?.width ?? 1));
}

export function imageAreaHeight(question: Pick<Question, "imageArea">): number {
  return Math.min(2.5, Math.max(0.5, question.imageArea?.height ?? 1));
}

export function hidesImageBoxes(
  settings: Pick<QuizSettings, "hideImageBoxes"> | undefined,
  question?: Pick<Question, "hideImageBoxes">,
): boolean {
  return question?.hideImageBoxes ?? settings?.hideImageBoxes === true;
}

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

/**
 * Tile width and left offset inside a grid `width` wide. A lone picture fills
 * the authored image area; the area itself is responsive and user-sized.
 */
export function imageChoiceTile(count: number, width: number, gapPx: number): { w: number; offset: number } {
  const cols = imageChoiceColumns(count);
  if (Math.floor(count) <= 1) {
    return { w: width, offset: 0 };
  }
  return { w: (width - gapPx * (cols - 1)) / cols, offset: 0 };
}

export function imageChoiceGridStyle(count: number, gapPx: number): {
  display: "grid";
  gap: string;
  gridTemplateColumns: string;
  justifyContent?: "center";
} {
  if (Math.floor(count) <= 1) {
    return { display: "grid", gap: `${gapPx}px`, gridTemplateColumns: "minmax(0, 1fr)" };
  }
  return {
    display: "grid",
    gap: `${gapPx}px`,
    gridTemplateColumns: `repeat(${imageChoiceColumns(count)}, minmax(0, 1fr))`,
  };
}

/** Longest a between-image word may grow, as a fraction of the grid width. */
export const IMAGE_JOINER_MAX_FRACTION = 0.55;

/**
 * Left-hand indexes that sit beside another picture. Two pictures have one
 * gap, three have two, and a picture that wraps to the next row has none.
 */
export function imageJoinerSlots(count: number): number[] {
  const n = Math.max(0, Math.floor(count));
  if (n < 2) return [];
  const cols = imageChoiceColumns(n);
  const slots: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    if (i % cols !== cols - 1) slots.push(i);
  }
  return slots;
}

/** The word in that gap, with surrounding space ignored. Blank when unset. */
export function imageJoinerLabel(joiners: readonly string[] | undefined, index: number): string {
  const text = joiners?.[index];
  return typeof text === "string" ? text.trim() : "";
}

/** True when at least two pictures have a non-blank word between neighbours. */
export function imageJoinersActive(count: number, joiners: readonly string[] | undefined): boolean {
  return imageJoinerSlots(count).some((index) => imageJoinerLabel(joiners, index) !== "");
}

/** True when a between-image word carries its own design. An empty object does not. */
export function imageJoinerStyled(style: Question["promptStyle"] | undefined): boolean {
  if (!style) return false;
  return Object.values(style).some((value) => value !== undefined);
}

/** Cap so one long word cannot take the whole row. */
export function imageJoinerMaxLabel(width: number, columns: number): number {
  if (!(width > 0)) return 0;
  return (width * IMAGE_JOINER_MAX_FRACTION) / Math.max(1, columns);
}

/**
 * Width of each horizontal gap when words are showing. `textWidth` is the
 * word itself (or its designed box), in the same pixels as `gapPx`. A shown
 * word adds that width plus `gapPx` of clear space on each side. An empty
 * neighbour stays a single `gapPx`. Returns null when nothing is showing, so
 * callers keep the ordinary tile math. Row spacing stays `gapPx`. A word that
 * would overflow the frame stops at the room left after a small tile.
 */
export function imageJoinerColumnGaps(
  count: number,
  width: number,
  gapPx: number,
  joiners: readonly string[] | undefined,
  textWidth: (text: string) => number,
): number[] | null {
  const n = Math.floor(count);
  if (!imageJoinersActive(n, joiners) || !(width > 0)) return null;
  const cols = imageChoiceColumns(n);
  if (cols < 2) return null;
  const gaps = Array.from({ length: cols - 1 }, () => gapPx);
  const cap = Math.max(gapPx, imageJoinerMaxLabel(width, cols));
  for (const index of imageJoinerSlots(n)) {
    const text = imageJoinerLabel(joiners, index);
    if (!text) continue;
    const col = index % cols;
    if (col >= gaps.length) continue;
    const measured = textWidth(text);
    const content = Number.isFinite(measured) ? Math.max(0, measured) : 0;
    const want = content + gapPx * 2;
    gaps[col] = Math.max(gaps[col], Math.min(want, cap));
  }
  const tileFloor = Math.max(8, Math.min(48, width / (cols * 4)));
  const available = Math.max(0, width - tileFloor * cols);
  const base = gapPx * gaps.length;
  const sum = gaps.reduce((total, gap) => total + gap, 0);
  if (sum <= available) return gaps;
  if (!(sum > base) || base >= available) {
    const each = gaps.length ? available / gaps.length : 0;
    return gaps.map(() => Math.min(gapPx, each));
  }
  const factor = (available - base) / (sum - base);
  return gaps.map((gap) => gapPx + (gap - gapPx) * factor);
}

/**
 * Column positions inside `width`. A null gap list is today's even gap, so
 * `left` matches `imageChoiceTile` exactly.
 */
export function imageColumnLayout(
  count: number,
  width: number,
  gapPx: number,
  columnGaps: readonly number[] | null,
): { colW: number; colX: number; left: (column: number) => number } {
  if (!columnGaps) {
    const tile = imageChoiceTile(count, width, gapPx);
    return {
      colW: tile.w,
      colX: tile.offset,
      left: (column) => tile.offset + column * (tile.w + gapPx),
    };
  }
  const cols = imageChoiceColumns(count);
  const used = columnGaps.reduce((total, gap) => total + gap, 0);
  const colW = (width - used) / Math.max(1, cols);
  return {
    colW,
    colX: 0,
    left: (column) => {
      let x = 0;
      for (let i = 0; i < column; i++) x += colW + (columnGaps[i] ?? 0);
      return x;
    },
  };
}

/**
 * Grid for pictures that have words between them. Joiner columns are at least
 * the tile gap and grow with the word. The row gap stays the tile gap.
 */
export function imageChoiceJoinedGridStyle(count: number, gapPx: number): {
  display: "grid";
  columnGap: string;
  rowGap: string;
  gridTemplateColumns: string;
} {
  const cols = imageChoiceColumns(Math.max(2, Math.floor(count)));
  const columns: string[] = [];
  for (let c = 0; c < cols; c++) {
    columns.push("minmax(0, 1fr)");
    if (c < cols - 1) columns.push(`minmax(${gapPx}px, max-content)`);
  }
  return {
    display: "grid",
    columnGap: "0px",
    rowGap: `${gapPx}px`,
    gridTemplateColumns: columns.join(" "),
  };
}

export function imageTileGridPlace(index: number, columns: number): { gridColumn: number; gridRow: number } {
  const cols = Math.max(1, columns);
  return { gridColumn: (index % cols) * 2 + 1, gridRow: Math.floor(index / cols) + 1 };
}

export function imageJoinerGridPlace(index: number, columns: number): { gridColumn: number; gridRow: number } {
  const cols = Math.max(1, columns);
  return { gridColumn: (index % cols) * 2 + 2, gridRow: Math.floor(index / cols) + 1 };
}

/** One gap's text. All-blank drops the field so the saved question matches an unset one. */
export function withImageJoiner(
  question: { options: readonly unknown[]; imageJoiners?: readonly string[] },
  index: number,
  value: string,
): string[] | undefined {
  const count = question.options.length;
  const slots = new Set(imageJoinerSlots(count));
  const next = Array.from({ length: count }, (_, i) => (slots.has(i) ? (question.imageJoiners?.[i] ?? "") : ""));
  if (slots.has(index)) next[index] = value;
  return imageJoinersActive(count, next) ? next : undefined;
}

/** Puts the same word in every side-by-side gap. */
export function withImageJoinersFilled(count: number, word: string): string[] | undefined {
  const slots = new Set(imageJoinerSlots(count));
  if (slots.size === 0) return undefined;
  const next = Array.from({ length: Math.floor(count) }, (_, i) => (slots.has(i) ? word : ""));
  return imageJoinersActive(count, next) ? next : undefined;
}
