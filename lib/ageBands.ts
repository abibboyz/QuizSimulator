import type { AgeBand, BgAnimation, OptionMarker, Theme } from "@/types/quiz";

/**
 * Age-banded colour schemes.
 *
 * Appearance only. A band re-colours the whole stage — surface, accent, answer
 * tiles, text, and the background animation — but never touches timers,
 * bonuses, layouts or option counts. A quiz that plays a certain way keeps
 * playing that way when you re-skin it for a different audience.
 *
 * The split points follow where colour preference actually shifts in
 * developmental research (Zentner; Franklin; Palmer & Schloss). Two findings
 * hold at every age and constrain all four palettes: blue is the single
 * most-preferred hue from about six upward, and olive / dark yellow is the
 * least liked at every age — so it appears in none of them.
 *
 * Every band stays on a dark surface. A light "nursery" surface for the
 * youngest band would be truer to the research, but the play chrome is
 * dark-first, and re-theming it is a behaviour change this feature doesn't make.
 * The bands vary hue, chroma and brightness instead.
 */

/** One tile: a background colour and the shape drawn on it. */
export interface OptionStyle {
  bg: string;
  shape: string;
  name: string;
}

export interface AgeBandDefinition {
  id: AgeBand;
  label: string;
  /** Why this band looks the way it does — shown in the builder. */
  blurb: string;
  accent: string;
  surface: string;
  glow: string;
  bgAnimation: BgAnimation;
  /**
   * The single colour every answer tile gets when this band is applied. Blue —
   * the most-preferred hue at every age from about six up, and safely clear of
   * the red and green the reveal uses. Each band takes its own depth of it.
   */
  tileColor: string;
  promptColor: string;
  titleColor: string;
  explanationColor: string;
  optionPalette: OptionStyle[];
}

/**
 * The shapes are the accessible fallback for the ~8% of boys with red-green
 * colour deficiency, and stable colour+shape pairing is what lets a player lock
 * onto an answer before they've finished reading it. They are therefore
 * IDENTICAL across every band and must stay that way — only `bg` shifts.
 */
const SHAPES = ["▲", "◆", "●", "■", "★", "⬢"] as const;

/**
 * Excluding red and green leaves two usable arcs: 20–80° and 160–340°. The
 * first comfortably holds only one hue (below ~30° reads orange-red, above ~55°
 * turns olive, the least-liked colour at every age), so amber takes it and the
 * other five spread evenly across the second. That's why the set runs cool —
 * it's what the no-red/no-green rule forces, not a stylistic choice.
 */
const HUE_NAMES = ["blue", "amber", "violet", "cyan", "magenta", "rose"] as const;

/** Pairs six background colours with the fixed shape/name order above. */
function palette(...backgrounds: string[]): OptionStyle[] {
  return backgrounds.map((bg, i) => ({ bg, shape: SHAPES[i], name: HUE_NAMES[i] }));
}

/**
 * The answer-tile palette used when no age band is chosen.
 *
 * No red and no green, ever: the reveal paints the correct tile `--color-good`
 * (green) and a wrong pick `--color-bad` (red), so a red or green answer tile
 * looks like a verdict before anyone has answered.
 *
 * Ordered so the first four are the most distinct from each other — most
 * questions have four options, and rose, the hue closest to the excluded red
 * arc, only appears once a question has six.
 */
export const OPTION_STYLES: OptionStyle[] = palette(
  "#2563eb",
  "#f59e0b",
  "#8b5cf6",
  "#0891b2",
  "#d946ef",
  "#ec4899",
);

/** The tile palette for a band, or the default set when no band is chosen. */
export function optionPalette(band?: AgeBand): OptionStyle[] {
  return band ? getAgeBand(band).optionPalette : OPTION_STYLES;
}

export function optionStyle(index: number, band?: AgeBand): OptionStyle {
  const styles = optionPalette(band);
  return styles[index % styles.length];
}

export const AGE_BANDS: AgeBandDefinition[] = [
  {
    id: "3-5",
    label: "Little kids · 3–5",
    blurb: "Primaries at full chroma — the strongest pull at this age.",
    accent: "#38bdf8",
    surface: "#101a3a",
    glow: "#f59e0b",
    bgAnimation: "shapes",
    tileColor: "#3b82f6",
    promptColor: "#ffffff",
    titleColor: "#facc15",
    explanationColor: "#c7cbdd",
    optionPalette: palette("#3b82f6", "#fbbf24", "#a78bfa", "#22d3ee", "#e879f9", "#f472b6"),
  },
  {
    id: "6-8",
    label: "Early years · 6–8",
    blurb: "Primaries still lead, widened toward violet and magenta.",
    accent: "#22d3ee",
    surface: "#0e1733",
    glow: "#a855f7",
    bgAnimation: "aurora",
    tileColor: "#2563eb",
    promptColor: "#f8fafc",
    titleColor: "#22d3ee",
    explanationColor: "#c7cbdd",
    optionPalette: palette("#2563eb", "#f59e0b", "#8b5cf6", "#06b6d4", "#d946ef", "#ec4899"),
  },
  {
    id: "9-12",
    label: "Tweens · 9–12",
    blurb: "Preference turns cooler — blue and cyan lead, chroma down a notch.",
    accent: "#38bdf8",
    surface: "#0b1120",
    glow: "#8b5cf6",
    bgAnimation: "particles",
    tileColor: "#1d4ed8",
    promptColor: "#e9ebf4",
    titleColor: "#38bdf8",
    explanationColor: "#99a0bd",
    optionPalette: palette("#1d4ed8", "#d97706", "#7c3aed", "#0891b2", "#c026d3", "#db2777"),
  },
  {
    id: "13-16",
    label: "Teens · 13–16",
    blurb: "Near-black base with neon accents; bright primaries read as childish.",
    accent: "#22d3ee",
    surface: "#06070f",
    glow: "#6366f1",
    bgAnimation: "starfield",
    tileColor: "#4338ca",
    promptColor: "#e9ebf4",
    titleColor: "#22d3ee",
    explanationColor: "#99a0bd",
    optionPalette: palette("#1e40af", "#a16207", "#6d28d9", "#0e7490", "#a21caf", "#be185d"),
  },
];

export function getAgeBand(id: AgeBand): AgeBandDefinition {
  return AGE_BANDS.find((band) => band.id === id) ?? AGE_BANDS[0];
}

export function isAgeBand(preset: string): preset is AgeBand {
  return AGE_BANDS.some((band) => band.id === preset);
}

/**
 * The band a theme is currently coloured for, if any.
 *
 * Derived from `theme.preset` rather than stored separately, so the two can
 * never disagree: choosing an ordinary palette preset drops the band by
 * definition, which is what the user is asking for when they click one.
 */
export function themeAgeBand(theme: Theme): AgeBand | undefined {
  return isAgeBand(theme.preset) ? theme.preset : undefined;
}

/**
 * Re-skins a theme for an age band: surface, accent, tiles, text, and the
 * background animation all move together, so one click gives a coherent look
 * instead of a palette bolted onto the previous audience's background.
 *
 * Returns a theme and nothing else — no settings, no questions. Any custom
 * background *image* is kept, since that's content the author supplied rather
 * than a colour choice. Earlier colour overrides are replaced by the band's
 * defaults, so a band switch is a clean slate to re-customise from.
 */
export function applyAgeBand(theme: Theme, id: AgeBand): Theme {
  const band = getAgeBand(id);
  return {
    ...theme,
    preset: band.id,
    accent: band.accent,
    surface: band.surface,
    bgAnimation: band.bgAnimation,
    promptColor: band.promptColor,
    titleColor: band.titleColor,
    explanationColor: band.explanationColor,
    // Left unset on purpose: each tile then picks black or white by contrast
    // against its own background, which no single colour can do correctly.
    optionTextColor: undefined,
    // One flat colour across every tile, which the author then adjusts slot by
    // slot or answer by answer. With the tiles no longer colour-coded, the
    // markers are what tell answers apart — another reason they default to
    // shapes. "Reset all" in the builder restores the band's varied palette.
    optionColors: new Array(band.optionPalette.length).fill(band.tileColor),
  };
}

/** The marker options offered in the builder, in display order. */
export const OPTION_MARKERS: { id: OptionMarker; label: string; sample: string }[] = [
  { id: "shapes", label: "Shapes", sample: "▲◆●■" },
  { id: "letters", label: "Letters", sample: "ABCD" },
  { id: "numbers", label: "Numbers", sample: "1234" },
  { id: "bullets", label: "Bullets", sample: "●●●●" },
  { id: "none", label: "None", sample: "—" },
];

/**
 * What to draw in an answer tile's badge.
 *
 * A per-option `icon` always wins, so an author can drop an emoji on one answer
 * without abandoning the scheme for the rest. Returns "" for no marker at all,
 * which callers should treat as "render no badge".
 */
/**
 * The background colour of an answer tile.
 *
 * Three layers, most specific first: this one answer's own colour, the
 * quiz-wide slot colour, then the age band's palette. Mirrors `optionMarker`
 * so tiles and badges are customised the same way.
 */
export function optionColor(
  index: number,
  options: { band?: AgeBand; colors?: string[]; override?: string } = {},
): string {
  const custom = options.override?.trim();
  if (custom) return custom;

  const styles = optionPalette(options.band);
  const slot = options.colors?.[index % styles.length]?.trim();
  return slot || styles[index % styles.length].bg;
}

export function optionMarker(
  index: number,
  options: { band?: AgeBand; marker?: OptionMarker; override?: string } = {},
): string {
  const custom = options.override?.trim();
  if (custom) return custom;

  switch (options.marker ?? "shapes") {
    case "letters":
      return String.fromCharCode(65 + (index % 26));
    case "numbers":
      return String(index + 1);
    case "bullets":
      return "●";
    case "none":
      return "";
    default:
      return optionStyle(index, options.band).shape;
  }
}
