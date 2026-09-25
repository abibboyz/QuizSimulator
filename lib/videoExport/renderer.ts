/**
 * Draws one frame of a solo run onto a canvas, from nothing but a timestamp.
 *
 * The live play screen is DOM + Tailwind + Motion, which can't be sampled at
 * an arbitrary time (and html2canvas-style DOM rasterising is both slow and
 * inexact — it ignores CSS animations entirely). So this reproduces the same
 * layout in canvas, measured in the same CSS pixels the components use, and
 * evaluates each animation (tile-in, the question swap, the reveal colour
 * change, cue overlays, confetti physics, the background) as a pure function
 * of time. Sizes, colours and durations are annotated with the class or
 * constant they mirror.
 *
 * Deliberately left out, because they are controls for a person holding the
 * device rather than part of the quiz: the mute button, Submit / Next buttons,
 * and the "Tap an answer" / keyboard hints. Their space is still reserved so
 * everything else sits where it sits in the app.
 */

import type { Cue, MediaRef, Option, Quiz } from "@/types/quiz";
import { DEFAULT_CORRECT_COLOR, DEFAULT_WRONG_COLOR, getPreset, readableTextOn, withAlpha } from "@/lib/themes";
import { optionColor, optionMarker, themeAgeBand } from "@/lib/ageBands";
import { DEFAULT_IMAGE_GAP, imageChoiceColumns } from "@/lib/imageChoice";
import { litSteps, mascotOf, METER_STEPS, pulseMs, quizProgressFraction, showsPerQuestion } from "@/lib/progress";
import { accuracyLabel } from "@/lib/scoring";
import { basePointsFor } from "@/lib/store/playSession";
import {
  COUNTDOWN_BEATS,
  POP_IN,
  QUESTION_SWAP,
  SCORE_TWEEN_MS,
  STAR_LANES,
  TILE_IN,
  TILE_STATE_MS,
  countdownBeatTransitionS,
  tileDelayMs,
} from "@/lib/playTiming";
import {
  alpha,
  clamp01,
  cubicBezier,
  easeIn,
  easeInOut,
  easeOut,
  easeOutCubic,
  keyframes,
  lerp,
  mixColor,
  mulberry32,
  parseColor,
  saturateColor,
  tailwindEase,
} from "@/lib/videoExport/motion";
import { sceneAt, type CueInstance, type QuestionRun, type Timeline } from "@/lib/videoExport/timeline";

/* ---------------------------------------------------------------- framing */

export type Framing = "vertical" | "horizontal";

/**
 * Each framing is the app at a real viewport size, scaled up to the output
 * resolution — so breakpoints, wrapping and proportions match a phone in
 * mobile view and a laptop in web view.
 */
export const FRAMINGS: Record<Framing, { cssWidth: number; cssHeight: number; narrow: boolean; label: string }> = {
  vertical: { cssWidth: 432, cssHeight: 768, narrow: true, label: "Vertical 9:16" },
  horizontal: { cssWidth: 1280, cssHeight: 720, narrow: false, label: "Horizontal 16:9" },
};

/* ------------------------------------------------------------------ assets */

export interface LoadedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
}

export interface FontSet {
  sans: string;
  mono: string;
  display: string;
}

export interface RenderAssets {
  images: Map<string, LoadedImage>;
  fonts: FontSet;
}

export function mediaKey(ref: MediaRef): string {
  return ref.kind === "stored" ? `s:${ref.id}` : `u:${ref.url}`;
}

/* ------------------------------------------------------------------ tokens */

/** globals.css @theme ink scale. */
const INK = {
  950: "#05060c",
  900: "#0a0c16",
  850: "#0f1120",
  800: "#14172a",
  700: "#1d2136",
  600: "#2b3049",
  500: "#454b69",
  400: "#6c7391",
  300: "#99a0bd",
  200: "#c7cbdd",
  100: "#e9ebf4",
};

const swapEase = cubicBezier(QUESTION_SWAP.ease);
const tileInEase = cubicBezier(TILE_IN.ease);
const popEase = cubicBezier(POP_IN.ease);
const CONFETTI_COLORS = ["#26ccff", "#a25afd", "#ff5e7e", "#88ff5a", "#fcff42", "#ffa62d", "#ff36ff"].map(parseColor);

type Ctx = CanvasRenderingContext2D;
type Align = "left" | "center" | "right";

interface Box {
  w: number;
  h: number;
  draw: (x: number, y: number) => void;
}

interface TextTile {
  option: Option;
  i: number;
  marker: string;
  markerW: number;
  isPicked: boolean;
  pickAt: number | null;
  showMark: boolean;
  lines: string[];
  h: number;
}

/* ================================================================ renderer */

export class FrameRenderer {
  private readonly ctx: Ctx;
  private readonly W: number;
  private readonly H: number;
  private readonly scale: number;
  private readonly narrow: boolean;
  /** Tailwind `md:` (≥768px) and `sm:` (≥640px) at this framing's viewport. */
  private readonly md: boolean;
  private readonly sm: boolean;

  private readonly accent: string;
  private readonly glow: string;
  private readonly surface: string;
  private readonly good: string;
  private readonly bad: string;
  private readonly promptColor: string;
  private readonly titleColor: string;
  private readonly explanationColor: string;
  private readonly quizFont: string;

  private readonly filterOK: boolean;
  private scratch: HTMLCanvasElement | null = null;
  private readonly wrapCache = new Map<string, string[]>();
  private readonly metricCache = new Map<string, { ascent: number; descent: number }>();
  private readonly dots: { x: number; y: number; vx: number; vy: number; r: number; depth: number }[] = [];
  private readonly reachedSteps: { at: number; value: number }[] = [];

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly timeline: Timeline,
    private readonly quiz: Quiz,
    framing: Framing,
    private readonly assets: RenderAssets,
  ) {
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Canvas 2D isn't available in this browser.");
    this.ctx = ctx;

    const f = FRAMINGS[framing];
    this.W = f.cssWidth;
    this.H = f.cssHeight;
    this.scale = canvas.width / f.cssWidth;
    this.narrow = f.narrow;
    this.md = f.cssWidth >= 768;
    this.sm = f.cssWidth >= 640;

    const theme = quiz.theme;
    this.accent = theme.accent;
    this.glow = getPreset(theme.preset).glow;
    this.surface = theme.surface;
    this.good = theme.correctColor ?? DEFAULT_CORRECT_COLOR;
    this.bad = theme.wrongColor ?? DEFAULT_WRONG_COLOR;
    this.promptColor = theme.promptColor ?? "#e9ebf4";
    this.titleColor = theme.titleColor ?? "#e9ebf4";
    this.explanationColor = theme.explanationColor ?? "#c7cbdd";
    this.quizFont =
      theme.font === "sans" ? assets.fonts.sans : theme.font === "mono" ? assets.fonts.mono : assets.fonts.display;

    // Canvas `filter` is Chrome/Firefox only; Safari gets the same frame minus two blurs.
    this.ctx.filter = "blur(1px)";
    this.filterOK = this.ctx.filter === "blur(1px)";
    this.ctx.filter = "none";

    this.seedDots();
    this.buildReachedSteps();
  }

  render(t: number) {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.globalAlpha = 1;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    this.drawBackground(t);

    const scene = sceneAt(this.timeline, t);
    if (scene.kind === "intro") this.drawIntro();
    else if (scene.kind === "results") this.drawResults(t);
    else this.drawStage(scene.index, scene.shown, scene.motion, scene.progress, t);

    for (const cue of this.timeline.cues) {
      if (t >= cue.start && t < cue.end) this.drawCue(cue, t - cue.start);
    }
    this.drawConfetti(t);
  }

  /* ============================================================ background */

  /** ThemeShell + AnimatedBackground. */
  private drawBackground(t: number) {
    const { ctx, W, H } = this;
    const theme = this.quiz.theme;

    ctx.fillStyle = this.surface;
    ctx.fillRect(0, 0, W, H);

    // radial-gradient(120% 120% at 50% 0%, glow/0.22 0%, surface 55%, #04050a 100%)
    this.ellipseGradient(W / 2, 0, 1.2 * W, 1.2 * H, [
      [0, withAlpha(this.glow, 0.22)],
      [0.55, this.surface],
      [1, "#04050a"],
    ]);

    const bg = theme.bgImage ? this.image(theme.bgImage) : null;
    if (bg) {
      if (theme.bgImageFit === "tile") {
        const startX = ((W / 2 - bg.width / 2) % bg.width) - bg.width;
        const startY = ((H / 2 - bg.height / 2) % bg.height) - bg.height;
        for (let y = startY; y < H; y += bg.height) {
          for (let x = startX; x < W; x += bg.width) ctx.drawImage(bg.source, x, y, bg.width, bg.height);
        }
      } else if (theme.bgImageFit === "contain") {
        this.drawContain(bg, 0, 0, W, H);
      } else {
        this.drawCover(bg, 0, 0, W, H);
      }
      ctx.fillStyle = `rgba(0, 0, 0, ${theme.bgImageDim})`;
      ctx.fillRect(0, 0, W, H);
    }

    const s = t / 1000;
    if (theme.bgAnimation === "aurora") this.drawAurora(s);
    else if (theme.bgAnimation === "shapes") this.drawShapes(s);
    else if (theme.bgAnimation === "particles" || theme.bgAnimation === "starfield")
      this.drawDots(t, theme.bgAnimation);

    // Vignette: radial-gradient(120% 90% at 50% 50%, transparent 35%, rgba(0,0,0,0.55) 100%)
    this.ellipseGradient(W / 2, H / 2, 1.2 * W, 0.9 * H, [
      [0, "rgba(0,0,0,0)"],
      [0.35, "rgba(0,0,0,0)"],
      [1, "rgba(0,0,0,0.55)"],
    ]);
  }

  private ellipseGradient(cx: number, cy: number, rx: number, ry: number, stops: [number, string][]) {
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(rx, ry);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    for (const [at, color] of stops) g.addColorStop(at, color);
    ctx.fillStyle = g;
    ctx.fillRect(-cx / rx - 1, -cy / ry - 1, this.W / rx + 2, this.H / ry + 2);
    ctx.restore();
  }

  /**
   * A `rounded-full` element under CSS `blur(σ)`, drawn as a radial gradient
   * with a Gaussian edge. Canvas `filter` would be exact but Safari doesn't
   * support it, and this is far cheaper at 4K.
   */
  private blurredEllipse(cx: number, cy: number, w: number, h: number, rotation: number, color: string, sigma: number) {
    const { ctx } = this;
    const R = (w + h) / 4;
    const rel = sigma / R;
    const outer = 1 + 3 * rel;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation);
    ctx.scale((w / 2) * outer, (h / 2) * outer);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    const base = parseColor(color);
    for (let i = 0; i <= 12; i++) {
      const r = (i / 12) * outer;
      const a = base.a * 0.5 * erfc((r - 1) / (rel * Math.SQRT2));
      g.addColorStop(r / outer, `rgba(${base.r}, ${base.g}, ${base.b}, ${Math.max(0, Math.min(1, a))})`);
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /** Aurora: three blur-3xl blobs on `aurora-drift 18s ease-in-out infinite`. */
  private drawAurora(s: number) {
    const { W, H } = this;
    const opacity = 0.45;
    const blobs = [
      { left: -0.25 * W, top: -H / 3, w: 0.8 * W, h: 0.8 * H, color: withAlpha(this.accent, opacity), delay: 0 },
      { left: 0.55 * W, top: 0, w: 0.7 * W, h: 0.7 * H, color: withAlpha(this.glow, opacity), delay: -6 },
      {
        left: 0.25 * W,
        top: H + 80 - 0.6 * H,
        w: 0.6 * W,
        h: 0.6 * H,
        color: withAlpha(this.accent, opacity * 0.7),
        delay: -12,
      },
    ];
    for (const b of blobs) {
      const p = ((((s - b.delay) % 18) + 18) % 18) / 18;
      // 0%/100%: translate(-6%,-4%) scale(1.1) rotate(0); 50%: translate(6%,4%) scale(1.25) rotate(12deg)
      const k = p < 0.5 ? easeInOut(p / 0.5) : 1 - easeInOut((p - 0.5) / 0.5);
      const tx = lerp(-0.06, 0.06, k) * b.w;
      const ty = lerp(-0.04, 0.04, k) * b.h;
      const sc = lerp(1.1, 1.25, k);
      const rot = (lerp(0, 12, k) * Math.PI) / 180;
      this.blurredEllipse(b.left + b.w / 2 + tx, b.top + b.h / 2 + ty, b.w * sc, b.h * sc, rot, b.color, 64);
    }
  }

  /** Floating shapes: six blur-2xl blobs on `blob-float 22s ease-in-out infinite`. */
  private drawShapes(s: number) {
    const { W, H } = this;
    const BLOBS = [
      { size: 26, left: 8, top: 12, delay: 0 },
      { size: 18, left: 72, top: 8, delay: -4 },
      { size: 32, left: 58, top: 58, delay: -9 },
      { size: 14, left: 24, top: 68, delay: -14 },
      { size: 20, left: 88, top: 40, delay: -18 },
      { size: 12, left: 42, top: 30, delay: -7 },
    ];
    const times = [0, 0.33, 0.66, 1];
    BLOBS.forEach((b, i) => {
      const d = (b.size / 100) * W;
      const p = ((((s - b.delay) % 22) + 22) % 22) / 22;
      const tx = keyframes([0, 0.03 * W, -0.02 * W, 0], p, easeInOut, times);
      const ty = keyframes([0, -0.04 * H, 0.03 * H, 0], p, easeInOut, times);
      const sc = keyframes([1, 1.08, 0.95, 1], p, easeInOut, times);
      const color = withAlpha(i % 2 === 0 ? this.accent : this.glow, 0.3);
      this.blurredEllipse(
        (b.left / 100) * W + d / 2 + tx,
        (b.top / 100) * H + d / 2 + ty,
        d * sc,
        d * sc,
        0,
        color,
        40,
      );
    });
  }

  /** ParticleCanvas, seeded so it's the same every export. Assumes a 2× screen, like the phones and laptops it plays on. */
  private seedDots() {
    const kind = this.quiz.theme.bgAnimation;
    if (kind !== "particles" && kind !== "starfield") return;
    const dpr = 2;
    const rand = mulberry32(0x5eed);
    const count = Math.min(140, Math.max(28, Math.round((this.W * dpr * this.H * dpr) / (9000 * dpr))));
    for (let i = 0; i < count; i++) {
      const depth = rand();
      this.dots.push({
        x: rand() * this.W,
        y: rand() * this.H,
        vx: (rand() - 0.5) * (kind === "starfield" ? 0.05 : 0.22),
        vy: kind === "starfield" ? 0.06 + depth * 0.22 : (rand() - 0.5) * 0.22,
        r: kind === "starfield" ? 0.5 + depth * 1.5 : 1 + rand() * 2,
        depth,
      });
    }
  }

  private drawDots(t: number, kind: "particles" | "starfield") {
    const { ctx, W, H } = this;
    // The live loop moves each dot once per animation frame (~60/s) and wraps just off-screen.
    const frames = (t / 1000) * 60;
    const wrap = (v: number, size: number) => ((((v + 5) % (size + 10)) + size + 10) % (size + 10)) - 5;
    const pos = this.dots.map((d) => ({ x: wrap(d.x + d.vx * frames, W), y: wrap(d.y + d.vy * frames, H), d }));

    for (const { x, y, d } of pos) {
      ctx.beginPath();
      ctx.arc(x, y, d.r, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(d.depth > 0.5 ? this.accent : this.glow, 0.65 * (0.35 + d.depth * 0.65));
      ctx.fill();
    }

    if (kind === "particles") {
      const maxDist = 130;
      ctx.lineWidth = 0.6;
      for (let i = 0; i < pos.length; i++) {
        for (let j = i + 1; j < pos.length; j++) {
          const dist = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y);
          if (dist > maxDist) continue;
          ctx.beginPath();
          ctx.moveTo(pos[i].x, pos[i].y);
          ctx.lineTo(pos[j].x, pos[j].y);
          ctx.strokeStyle = withAlpha(this.accent, (1 - dist / maxDist) * 0.18);
          ctx.stroke();
        }
      }
    }
  }

  /* ================================================================= intro */

  /** The play screen's intro card: what sits behind the start cue. */
  private drawIntro() {
    const { W, H, md } = this;
    const quiz = this.quiz;
    const maxW = this.narrow ? 416 : 672;
    const CW = Math.min(W, maxW) - 48;
    const x0 = (W - CW) / 2;

    const blocks: Box[] = [];
    blocks.push(
      this.textBox("SOLO RUN", CW, { size: 12, lh: 16, weight: 600, color: INK[400], spacing: 3.6, align: "center" }),
    );
    blocks.push(
      this.textBox(quiz.title, CW, {
        size: md ? 60 : 36,
        lh: md ? 60 : 40,
        weight: 800,
        color: this.titleColor,
        family: this.quizFont,
        align: "center",
        balance: true,
      }),
    );
    if (quiz.description) {
      blocks.push(
        this.textBox(quiz.description, CW, { size: 18, lh: 28, weight: 400, color: INK[300], align: "center" }),
      );
    }

    const chips = [
      `${quiz.questions.length} questions`,
      quiz.settings.timerSeconds ? `${quiz.settings.timerSeconds}s per question` : "No timer",
      `${basePointsFor(quiz, quiz.questions[0]).toLocaleString()} base points`,
      ...(quiz.settings.speedBonus ? ["Speed bonus"] : []),
      ...(quiz.settings.streakBonus ? ["Streak multiplier"] : []),
    ];
    blocks.push(this.chipsBox(chips, CW));

    const gap = 24;
    const total = blocks.reduce((sum, b) => sum + b.h, 0) + gap * (blocks.length - 1);
    let y = Math.max(0, (H - total) / 2);
    for (const b of blocks) {
      b.draw(x0 + (CW - b.w) / 2, y);
      y += b.h + gap;
    }
  }

  private chipsBox(chips: string[], maxW: number): Box {
    const font = this.font(400, 14);
    const sizes = chips.map((text) => ({ text, w: this.measure(text, font) + 24 + 2, h: 30 }));
    const rows: { items: typeof sizes; w: number }[] = [];
    for (const chip of sizes) {
      const row = rows[rows.length - 1];
      if (row && row.w + 8 + chip.w <= maxW) {
        row.items.push(chip);
        row.w += 8 + chip.w;
      } else {
        rows.push({ items: [chip], w: chip.w });
      }
    }
    return {
      w: maxW,
      h: rows.length * 30 + (rows.length - 1) * 8,
      draw: (x, y) => {
        rows.forEach((row, r) => {
          let cx = x + (maxW - row.w) / 2;
          const cy = y + r * 38;
          for (const chip of row.items) {
            this.fillRR(cx, cy, chip.w, chip.h, chip.h / 2, withAlpha(INK[900], 0.6));
            this.strokeRR(cx + 0.5, cy + 0.5, chip.w - 1, chip.h - 1, chip.h / 2, INK[600], 1);
            this.drawLine(chip.text, cx + chip.w / 2, cy + 5, 20, font, INK[300], "center");
            cx += chip.w + 8;
          }
        });
      },
    };
  }

  /* ================================================================= stage */

  private drawStage(
    index: number,
    shown: QuestionRun,
    motion: "enter" | "exit" | "still",
    progress: number,
    t: number,
  ) {
    const { ctx, W, H } = this;
    const current = this.timeline.questions[index];
    const maxW = this.narrow ? 416 : 896;
    const CW = Math.min(W, maxW) - 40;
    const x0 = (W - CW) / 2;

    const progressBox = this.quizProgressBox(index, t, CW);
    const stage = this.questionStageBox(shown, t, CW);

    // Player-only controls aren't drawn, but their space is reserved: the
    // "mt-8" button row (with Submit / Next when they'd show) and the hint line.
    const revealedNow = t >= current.revealAt;
    const showsButton =
      (revealedNow && this.quiz.settings.revealAfterEach) || (!revealedNow && current.question.kind === "multi-select");
    const buttonRow = 32 + (showsButton ? 48 : 0);
    const barShown = current.timeoutBar && revealedNow;
    const bottom = barShown ? 42 : 32;

    const qpH = progressBox ? progressBox.h + 20 : 0;
    const contentH = qpH + stage.h + buttonRow + bottom;
    const avail = H - 64;
    // Taller than the screen: the app would scroll; a video can't, so it fits.
    const fit = contentH > avail ? avail / contentH : 1;
    const top = 32 + Math.max(0, (avail - contentH * fit) / 2);

    ctx.save();
    ctx.translate(W / 2, top);
    ctx.scale(fit, fit);
    ctx.translate(-W / 2, 0);

    if (progressBox) progressBox.draw(x0, 0);

    ctx.save();
    if (motion !== "still") {
      const e = swapEase(progress);
      const x = motion === "enter" ? QUESTION_SWAP.offsetPx * (1 - e) : -QUESTION_SWAP.offsetPx * e;
      ctx.globalAlpha *= motion === "enter" ? e : 1 - e;
      ctx.translate(x, 0);
    }
    stage.draw(x0, qpH);
    ctx.restore();

    if (barShown) this.drawTimeoutBar(current, t, x0, qpH + stage.h + buttonRow + 16, CW);
    ctx.restore();
  }

  /** AutoAdvanceBar. */
  private drawTimeoutBar(run: QuestionRun, t: number, x0: number, y: number, CW: number) {
    const { ctx } = this;
    const total = Math.max(1, run.holdSeconds);
    const since = t - run.revealAt;
    const left = Math.max(0, total - Math.floor(since / 1000));
    const isLast = run.index + 1 >= this.timeline.questions.length;
    const w = Math.min(320, CW);
    const x = x0 + (CW - w) / 2;
    const font = this.font(600, 12);
    const lead = `Out of time — ${isLast ? "results" : "next question"} in `;
    const tail = `${left}s`;
    const lw = this.measure(lead, font);
    const tw = this.measure(tail, font);
    const start = x + (w - lw - tw) / 2;
    this.drawLine(lead, start, y, 16, font, INK[400], "left");
    this.drawLine(tail, start + lw, y, 16, font, this.accent, "left");
    this.fillRR(x, y + 24, w, 2, 1, INK[800]);
    ctx.fillStyle = this.accent;
    ctx.fillRect(x, y + 24, w * Math.max(0, 1 - since / (total * 1000)), 2);
  }

  /* ------------------------------------------------------- quiz progress */

  private buildReachedSteps() {
    const reveal = this.quiz.settings.revealAfterEach;
    let answered = 0;
    let value = 0;
    this.reachedSteps.push({ at: -Infinity, value: 0 });
    for (const run of this.timeline.questions) {
      if (Math.max(answered, run.index) !== value) {
        value = Math.max(answered, run.index);
        this.reachedSteps.push({ at: run.enterAt, value });
      }
      if (reveal) answered = run.index + 1;
      if (Math.max(answered, run.index) !== value) {
        value = Math.max(answered, run.index);
        this.reachedSteps.push({ at: run.revealAt, value });
      }
    }
  }

  /** Reached count at t, with QuizProgress's 300ms ease-out width transition. */
  private reachedAt(t: number): { value: number; shown: number } {
    let i = 0;
    while (i + 1 < this.reachedSteps.length && this.reachedSteps[i + 1].at <= t) i++;
    const step = this.reachedSteps[i];
    const prev = i > 0 ? this.reachedSteps[i - 1].value : step.value;
    return { value: step.value, shown: lerp(prev, step.value, easeOut(clamp01((t - step.at) / 300))) };
  }

  private quizProgressBox(index: number, t: number, CW: number): Box | null {
    const settings = this.quiz.settings;
    const style = settings.quizProgressStyle;
    const total = this.timeline.questions.length;
    if (style === "none" || total <= 0) return null;

    const outcomes = settings.revealAfterEach
      ? this.timeline.questions.filter((r) => r.revealAt <= t).map((r) => r.correct)
      : [];
    const answered = outcomes.length;
    const { value: reached, shown } = this.reachedAt(t);
    const fraction = quizProgressFraction(shown, total);
    const { ctx } = this;

    if (style === "mascot") {
      return {
        w: CW,
        h: 36,
        draw: (x, y) => {
          this.fillRR(x, y + 32, CW, 4, 2, "rgba(255,255,255,0.12)");
          this.fillRR(x, y + 32, CW * fraction, 4, 2, this.accent);
          ctx.save();
          ctx.globalAlpha *= 0.7;
          this.drawLine("🏁", x + CW, y + 18, 18, this.font(400, 18), "#fff", "right");
          ctx.restore();
          const mountAt = this.timeline.questions[0]?.mountAt ?? 0;
          this.drawMascot(x + CW * fraction, y + 32, 28, 24, settings.progressMascot, settings.progressMascotMedia, {
            kind: "walk",
            phase: (t - mountAt) / 1200,
          });
        },
      };
    }

    if (showsPerQuestion(style, total)) {
      const dot = style === "dots";
      const h = dot ? 8 : 6;
      const gap = 6;
      const itemW = Math.max(0, (CW - gap * (total - 1)) / total);
      const w = dot ? Math.min(12, itemW) : itemW;
      return {
        w: CW,
        h,
        draw: (x, y) => {
          for (let i = 0; i < total; i++) {
            const known = i < answered;
            const current = i === index;
            const color = known
              ? outcomes[i]
                ? this.good
                : this.bad
              : current
                ? this.accent
                : i < reached
                  ? withAlpha(this.accent, 0.35)
                  : "rgba(255,255,255,0.14)";
            const ix = x + i * (w + gap);
            const r = dot ? h / 2 : 2;
            if (current) this.fillRing(ix, y, w, h, r, 2, "rgba(255,255,255,0.5)");
            this.fillRR(ix, y, w, h, r, color);
          }
        },
      };
    }

    return {
      w: CW,
      h: 6,
      draw: (x, y) => {
        this.fillRR(x, y, CW, 6, 3, "rgba(255,255,255,0.12)");
        if (fraction > 0) this.fillRR(x, y, CW * fraction, 6, 3, this.accent);
      },
    };
  }

  /* ------------------------------------------------------ question stage */

  private questionStageBox(run: QuestionRun, t: number, CW: number): Box {
    const { md } = this;
    const q = run.question;
    const revealed = t >= run.revealAt;
    const gap = md ? 32 : 24;

    const parts: Box[] = [this.stageHeaderBox(run, t, CW)];

    const imageLeads = q.layout === "image-top" && !!q.media;
    if (imageLeads) {
      const media = this.mediaBox(q.media, CW, this.H * 0.26, 16);
      if (media) parts.push(this.centered(media, CW));
    }

    const promptBox = this.textBox(q.prompt || "Untitled question", CW, {
      size: md ? 30 : 20,
      lh: md ? 41.25 : 27.5,
      weight: 700,
      color: q.prompt ? this.promptColor : INK[500],
      family: this.quizFont,
      align: "center",
      balance: true,
    });
    if (!imageLeads && q.media) {
      const media = this.mediaBox(q.media, CW, this.H * 0.22, 16);
      parts.push(this.stack([promptBox, ...(media ? [this.centered(media, CW)] : [])], 16, CW));
    } else {
      parts.push(promptBox);
    }

    parts.push(q.kind === "image-choice" ? this.imageGridBox(run, t, CW) : this.answerGridBox(run, t, CW));

    if (revealed && q.explanation) parts.push(this.explanationBox(q.explanation, run.revealAt, t, CW));

    return this.stack(parts, gap, CW);
  }

  /** "Question 1 of 8" on the left; streak, score and the timer on the right. */
  private stageHeaderBox(run: QuestionRun, t: number, CW: number): Box {
    const q = run.question;
    const revealed = t >= run.revealAt;

    // ScoreBadge (compact). It remounts with each question, so the score only
    // tweens when it changes mid-question — at the reveal.
    const scoreValue =
      t < run.revealAt
        ? run.scoreBefore
        : Math.round(lerp(run.scoreBefore, run.scoreAfter, easeOutCubic((t - run.revealAt) / SCORE_TWEEN_MS)));
    const streak = revealed ? run.streakAfter : run.streakBefore;
    const scoreFont = this.font(700, 20);
    const scoreText = scoreValue.toLocaleString();
    const scoreW = this.measure(scoreText, scoreFont);
    const pillFont = this.font(700, 14);
    const pillText = `🔥 ${streak}`;
    const pillW = streak >= 2 ? this.measure(pillText, pillFont) + 24 + 2 : 0;
    const badgeW = pillW ? pillW + 12 + scoreW : scoreW;
    const badgeH = pillW ? 30 : 28;

    const meter = run.limitSeconds !== null ? this.meterBox(run, t) : null;
    const groupW = badgeW + (meter ? 16 + meter.w : 0);
    const groupH = Math.max(badgeH, meter?.h ?? 0);

    const metaFont = this.font(600, 12);
    const main = `QUESTION ${run.index + 1} OF ${this.timeline.questions.length}`;
    const extra =
      q.kind === "multi-select" ? "· PICK ALL THAT APPLY" : q.kind === "image-choice" ? "· PICK AN IMAGE" : "";
    const metaMax = Math.max(40, CW - groupW - 16);
    const mainW = this.measure(main, metaFont, 1.2);
    const extraW = extra ? this.measure(extra, metaFont, 1.2) : 0;
    const extraInline = !extra || mainW + 8 + extraW <= metaMax;
    const extraLines = extra && !extraInline ? this.wrap(extra, metaFont, metaMax, 1.2) : [];
    const metaH = 16 * (1 + extraLines.length);

    return {
      w: CW,
      h: Math.max(metaH, groupH),
      draw: (x, y) => {
        this.drawLine(main, x, y, 16, metaFont, INK[300], "left", 1.2);
        if (extra && extraInline) this.drawLine(extra, x + mainW + 8, y, 16, metaFont, INK[400], "left", 1.2);
        extraLines.forEach((line, i) => this.drawLine(line, x, y + 16 * (i + 1), 16, metaFont, INK[400], "left", 1.2));

        let gx = x + CW - groupW;
        const cy = y + groupH / 2;
        if (pillW) {
          // `.animate-streak`, keyed by the streak: plays on mount and whenever it grows.
          const grew = revealed && run.streakAfter !== run.streakBefore;
          const flareStart = grew ? Math.max(run.mountAt, run.revealAt) : run.mountAt;
          const fp = clamp01((t - flareStart) / 450);
          const sc = keyframes([0.85, 1.15, 1], fp, easeOut, [0, 0.6, 1]);
          const op = keyframes([0.6, 1, 1], fp, easeOut, [0, 0.6, 1]);
          const px = gx;
          this.withTransform(px + pillW / 2, cy, sc, 0, op, () => {
            const py = cy - 15;
            this.fillRR(px, py, pillW, 30, 15, withAlpha("#fbbf24", 0.15));
            this.strokeRR(px + 0.5, py + 0.5, pillW - 1, 29, 14.5, withAlpha("#fbbf24", 0.4), 1);
            this.drawLine(pillText, px + pillW / 2, py + 5, 20, pillFont, "#fcd34d", "center");
          });
          gx += pillW + 12;
        }
        this.drawLine(scoreText, gx + scoreW, cy - 14, 28, scoreFont, INK[100], "right");
        gx += scoreW;
        if (meter) meter.draw(gx + 16, cy - meter.h / 2);
      },
    };
  }

  /* --------------------------------------------------------------- timer */

  private meterState(run: QuestionRun, t: number) {
    const limitMs = (run.limitSeconds ?? 0) * 1000;
    const elapsed = t < run.liveAt ? 0 : Math.min(t - run.liveAt, run.frozenElapsedMs);
    const remaining = Math.max(0, limitMs - elapsed);
    const fraction = limitMs > 0 ? Math.max(0, Math.min(1, remaining / limitMs)) : 1;
    return {
      fraction,
      secondsLeft: Math.ceil(remaining / 1000),
      urgent: fraction <= 0.25,
      urgentSince: run.liveAt + 0.75 * limitMs,
    };
  }

  /**
   * Cycles the meter's pulse (and the mascot's stride) has run through since
   * it mounted. The period follows `pulseMs(fraction)`, which shrinks as the
   * clock drains; integrating it keeps the beat accelerating smoothly.
   */
  private pulsePhase(run: QuestionRun, t: number): number {
    const limitMs = (run.limitSeconds ?? 0) * 1000;
    const freezeAt = run.liveAt + run.frozenElapsedMs;
    const full = pulseMs(1);
    const span = full - pulseMs(0);
    const F = (time: number): number => {
      if (time <= run.liveAt || limitMs <= 0) return (time - run.liveAt) / full;
      if (time <= freezeAt) {
        const u = time - run.liveAt;
        // ∫ du / (full − span·u/L)
        return (limitMs / span) * Math.log(full / Math.max(1, full - (span * u) / limitMs));
      }
      const frozen = Math.max(0, 1 - run.frozenElapsedMs / limitMs);
      return F(freezeAt) + (time - freezeAt) / pulseMs(frozen);
    };
    return F(t) - F(run.mountAt);
  }

  /** ProgressMeter at size 64. */
  private meterBox(run: QuestionRun, t: number): Box {
    const { ctx } = this;
    const size = 64;
    const style = this.quiz.settings.progressStyle;
    const pulse = this.quiz.settings.progressPulse;
    const st = this.meterState(run, t);
    const tint = st.urgent ? this.bad : this.accent;
    const phase = this.pulsePhase(run, t);
    const cyc = phase - Math.floor(phase);

    // The pulse wrapper: a scale (heartbeat, throb) or opacity (flash) cycle.
    const wrap = (w: number, h: number, draw: (x: number, y: number) => void): Box => ({
      w,
      h,
      draw: (x, y) => {
        let sc = 1;
        let op = 1;
        if (pulse === "heartbeat")
          sc = keyframes([1, 1.13, 1, 1.07, 1, 1], cyc, easeInOut, [0, 0.12, 0.24, 0.36, 0.48, 1]);
        else if (pulse === "throb") sc = keyframes([1, 1.07, 1], cyc, easeInOut);
        else if (pulse === "flash") op = keyframes([1, 0.4, 1], cyc, easeInOut);
        this.withTransform(x + w / 2, y + h / 2, sc, 0, op, () => draw(x, y));
      },
    });

    const countFont = this.font(700, size * 0.34);
    const countLh = size * 0.34 * 1.5;
    const count = `${st.secondsLeft}`;
    const countW = this.measure(count, countFont);

    if (style === "ring") {
      // TimerRing: `.animate-urgent` blinks the whole ring once it's urgent.
      return wrap(size, size, (x, y) => {
        const op = st.urgent ? keyframes([1, 0.45, 1], ((((t - st.urgentSince) / 700) % 1) + 1) % 1, easeInOut) : 1;
        this.withTransform(x + size / 2, y + size / 2, 1, 0, op, () => {
          const stroke = size * 0.09;
          const r = (size - stroke) / 2;
          const cx = x + size / 2;
          const cy = y + size / 2;
          ctx.lineWidth = stroke;
          ctx.strokeStyle = "rgba(255,255,255,0.12)";
          ctx.beginPath();
          ctx.arc(cx, cy, r, 0, Math.PI * 2);
          ctx.stroke();
          if (st.fraction > 0.001) {
            // `transition: stroke 0.3s ease` when it turns urgent.
            ctx.strokeStyle = mixColor(this.accent, this.bad, st.urgent ? clamp01((t - st.urgentSince) / 300) : 0);
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * st.fraction);
            ctx.stroke();
            ctx.lineCap = "butt";
          }
          this.drawLine(
            count,
            cx,
            cy - size * 0.24,
            size * 0.48,
            this.font(700, size * 0.32),
            st.urgent ? this.bad : INK[100],
            "center",
          );
        });
      });
    }

    if (style === "bar") {
      const trackW = size * 2.4;
      const trackH = Math.max(6, size * 0.14);
      const h = Math.max(countLh, trackH);
      return wrap(countW + 8 + trackW, h, (x, y) => {
        this.drawLine(count, x, y + (h - countLh) / 2, countLh, countFont, tint, "left");
        const tx = x + countW + 8;
        const ty = y + (h - trackH) / 2;
        this.fillRR(tx, ty, trackW, trackH, trackH / 2, "rgba(255,255,255,0.12)");
        if (st.fraction > 0) this.fillRR(tx, ty, trackW * st.fraction, trackH, trackH / 2, tint);
      });
    }

    if (style === "pill") {
      const w = size * 1.7;
      const h = size * 0.62;
      return wrap(w, h, (x, y) => {
        ctx.save();
        this.rr(x, y, w, h, h / 2);
        ctx.clip();
        ctx.fillStyle = "rgba(255,255,255,0.12)";
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha *= 0.35;
        ctx.fillStyle = tint;
        ctx.fillRect(x, y, w * st.fraction, h);
        ctx.restore();
        this.drawLine(count, x + w / 2, y + (h - countLh) / 2, countLh, countFont, tint, "center");
      });
    }

    if (style === "segments" || style === "dots") {
      const dot = style === "dots";
      const lit = litSteps(st.fraction);
      const sw = dot ? size * 0.15 : size * 0.11;
      const sh = dot ? size * 0.15 : size * 0.34;
      const g = Math.max(2, size * 0.05);
      const stepsW = METER_STEPS * sw + (METER_STEPS - 1) * g;
      const h = Math.max(countLh, sh);
      return wrap(countW + 8 + stepsW, h, (x, y) => {
        this.drawLine(count, x, y + (h - countLh) / 2, countLh, countFont, tint, "left");
        for (let i = 0; i < METER_STEPS; i++) {
          ctx.save();
          ctx.globalAlpha *= i < lit ? 1 : 0.6;
          this.fillRR(
            x + countW + 8 + i * (sw + g),
            y + (h - sh) / 2,
            sw,
            sh,
            dot ? sw / 2 : 2,
            i < lit ? tint : "rgba(255,255,255,0.14)",
          );
          ctx.restore();
        }
      });
    }

    // mascot
    const track = size * 2.4;
    const glyph = size * 0.5;
    const mFont = this.font(700, size * 0.3);
    const mLh = size * 0.3 * 1.5;
    const mW = this.measure(count, mFont);
    const h = Math.max(mLh, glyph * 1.5);
    const celebrate = t >= run.revealAt && run.correct;
    return wrap(mW + 8 + track, h, (x, y) => {
      this.drawLine(count, x, y + (h - mLh) / 2, mLh, mFont, tint, "left");
      const tx = x + mW + 8;
      const base = y + (h - glyph * 1.5) / 2 + glyph * 1.5;
      const lineH = Math.max(2, size * 0.04);
      this.fillRR(tx, base - lineH, track, lineH, lineH / 2, "rgba(255,255,255,0.16)");
      ctx.save();
      ctx.globalAlpha *= 0.7;
      this.drawLine("🏁", tx + track, base - glyph * 0.7, glyph * 0.7, this.font(400, glyph * 0.7), "#fff", "right");
      ctx.restore();
      this.drawMascot(
        tx + (1 - st.fraction) * track,
        base,
        glyph,
        glyph,
        this.quiz.settings.progressMascot,
        this.quiz.settings.progressMascotMedia,
        celebrate ? { kind: "dance", phase: (t - run.revealAt) / 600 } : { kind: "walk", phase },
      );
    });
  }

  /** MascotFigure in a `box`-sized square whose bottom centre is (cx, bottom). */
  private drawMascot(
    cx: number,
    bottom: number,
    box: number,
    glyph: number,
    character: string | undefined,
    media: MediaRef | undefined,
    anim: { kind: "walk" | "dance"; phase: number },
  ) {
    const p = anim.phase - Math.floor(anim.phase);
    let ty: number;
    let rot: number;
    let sc = 1;
    if (anim.kind === "walk") {
      ty = keyframes([0, -0.22, 0], p, easeInOut) * box;
      rot = keyframes([-7, 7, -7], p, easeInOut);
    } else {
      ty = keyframes([0, -0.45, 0, -0.45, 0], p, easeInOut) * box;
      rot = keyframes([0, -20, 0, 20, 0], p, easeInOut);
      sc = keyframes([1, 1.2, 1, 1.2, 1], p, easeInOut);
    }
    const { ctx } = this;
    ctx.save();
    ctx.translate(cx, bottom - box / 2 + ty);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(sc, sc);
    const img = media ? this.image(media) : null;
    if (img) {
      this.drawContain(img, -box / 2, -box / 2, box, box);
    } else {
      // Side-view emoji face left; the app mirrors them so they walk forwards.
      ctx.scale(-1, 1);
      this.drawLine(mascotOf(character), 0, -glyph / 2, glyph, this.font(400, glyph), "#fff", "center");
    }
    ctx.restore();
  }

  /* ------------------------------------------------------------- answers */

  /** `.animate-tile-in`, staggered, from when the question mounted. */
  private tileIn(run: QuestionRun, index: number, t: number) {
    const e = tileInEase(clamp01((t - run.mountAt - tileDelayMs(index)) / TILE_IN.durationMs));
    return { opacity: e, dy: 10 * (1 - e), scale: lerp(0.97, 1, e) };
  }

  private pickedAt(run: QuestionRun, optionId: string): number | null {
    return run.picks.find((p) => p.optionId === optionId)?.at ?? null;
  }

  /** AnswerGrid for the text kinds (multiple choice, true/false, pick-all). */
  private answerGridBox(run: QuestionRun, t: number, CW: number): Box {
    const q = run.question;
    const theme = this.quiz.theme;
    const band = themeAgeBand(theme);
    const revealed = t >= run.revealAt;
    const rp = revealed ? tailwindEase(clamp01((t - run.revealAt) / TILE_STATE_MS)) : 0;
    // grid-cols-1, or sm:grid-cols-2 unless narrow / list layout
    const cols = this.narrow || q.layout === "list" ? 1 : this.sm ? 2 : 1;
    const gap = this.md ? 16 : 12;
    const colW = (CW - gap * (cols - 1)) / cols;
    const font = this.font(600, this.md ? 18 : 16);
    const lh = this.md ? 28 : 24;
    const markerFont = this.font(600, 24);

    const tiles: TextTile[] = q.options.map((option, i) => {
      const marker = optionMarker(i, { band, marker: theme.optionMarker, override: option.icon });
      const pickAt = this.pickedAt(run, option.id);
      const isPicked = pickAt !== null && t >= pickAt;
      const showMark = revealed && (option.correct || isPicked);
      const markerW = marker ? this.measure(marker, markerFont) : 0;
      const markW = showMark ? this.measure(option.correct ? "✓" : "✕", markerFont) : 0;
      const textW = colW - 32 - (marker ? markerW + 12 : 0) - (option.media ? 68 : 0) - (showMark ? markW + 12 : 0);
      const lines = this.wrap(option.text, font, Math.max(20, textW));
      const inner = Math.max(marker ? 32 : 0, option.media ? 56 : 0, lines.length * lh, showMark ? 32 : 0);
      return { option, i, marker, markerW, isPicked, pickAt, showMark, lines, h: Math.max(80, inner + 32) };
    });

    const rows: TextTile[][] = [];
    for (let i = 0; i < tiles.length; i += cols) rows.push(tiles.slice(i, i + cols));
    const rowH = rows.map((row) => Math.max(...row.map((tile) => tile.h)));
    const h = rowH.reduce((a, b) => a + b, 0) + gap * Math.max(0, rows.length - 1);

    return {
      w: CW,
      h,
      draw: (x, y) => {
        let ry = y;
        rows.forEach((row, r) => {
          row.forEach((tile, c) => {
            this.drawTextTile(
              run,
              tile,
              x + c * (colW + gap),
              ry,
              colW,
              rowH[r],
              t,
              revealed,
              rp,
              font,
              lh,
              markerFont,
            );
          });
          ry += rowH[r] + gap;
        });
      },
    };
  }

  private drawTextTile(
    run: QuestionRun,
    tile: TextTile,
    x: number,
    y: number,
    w: number,
    h: number,
    t: number,
    revealed: boolean,
    rp: number,
    font: string,
    lh: number,
    markerFont: string,
  ) {
    const { ctx } = this;
    const theme = this.quiz.theme;
    const { option, i } = tile;
    const bg = optionColor(i, { band: themeAgeBand(theme), colors: theme.optionColors, override: option.color });
    const showCorrect = revealed && option.correct;
    const showWrong = revealed && tile.isPicked && !option.correct;
    const faded = revealed && !option.correct && !tile.isPicked;

    // `transition-all duration-200`: background, text colour, rings and opacity all ease together.
    const fill = mixColor(bg, showCorrect ? this.good : showWrong ? this.bad : bg, rp);
    const restText = theme.optionTextColor ?? readableTextOn(bg);
    const targetText = showCorrect ? readableTextOn(this.good) : showWrong ? readableTextOn(this.bad) : restText;
    const textColor = mixColor(restText, targetText, rp);

    // `ring-4 ring-white/70` while picked; the correct tile's white ring + glow on reveal; `ring-white/40` on a wrong pick.
    const pickP =
      tile.pickAt !== null && t >= tile.pickAt ? tailwindEase(clamp01((t - tile.pickAt) / TILE_STATE_MS)) : 0;
    const ringBefore = 0.7 * pickP;
    const ring = revealed ? lerp(ringBefore, showCorrect ? 1 : showWrong ? 0.4 : 0, rp) : ringBefore;
    const glow = showCorrect ? rp : 0;

    const tin = this.tileIn(run, i, t);
    const opacity = tin.opacity * (faded ? lerp(1, 0.35, rp) : 1);
    const r = 16;

    this.withTransform(x + w / 2, y + h / 2 + tin.dy, tin.scale, 0, opacity, () => {
      if (glow > 0) this.glowShadow(x, y, w, h, r, 6, 40, withAlpha(this.good, 0.9 * glow));
      if (ring > 0) this.fillRing(x, y, w, h, r, 4, `rgba(255,255,255,${ring})`);
      this.fillRR(x, y, w, h, r, faded ? saturateColor(fill, lerp(1, 0.5, rp)) : fill);

      let cx = x + 16;
      const cy = y + h / 2;
      if (tile.marker) {
        ctx.save();
        ctx.globalAlpha *= 0.9;
        this.drawLine(tile.marker, cx, cy - 16, 32, markerFont, textColor, "left");
        ctx.restore();
        cx += tile.markerW + 12;
      }
      if (option.media) {
        const img = this.image(option.media);
        ctx.save();
        this.rr(cx, cy - 28, 56, 56, 8);
        ctx.clip();
        if (img) this.drawCover(img, cx, cy - 28, 56, 56);
        else {
          ctx.fillStyle = INK[800];
          ctx.fillRect(cx, cy - 28, 56, 56);
        }
        ctx.restore();
        cx += 68;
      }
      const textTop = cy - (tile.lines.length * lh) / 2;
      tile.lines.forEach((line, li) => this.drawLine(line, cx, textTop + li * lh, lh, font, textColor, "left"));
      if (tile.showMark) {
        this.drawLine(option.correct ? "✓" : "✕", x + w - 16, cy - 16, 32, markerFont, textColor, "right");
      }
    });
  }

  /** AnswerGrid for image-choice: the numbered picture grid. */
  private imageGridBox(run: QuestionRun, t: number, CW: number): Box {
    const q = run.question;
    const cols = imageChoiceColumns(q.options.length);
    const gap = q.optionGap ?? DEFAULT_IMAGE_GAP;
    const colW = (CW - gap * (cols - 1)) / cols;
    const boxH = (colW * 2) / 3; // aspect-[3/2]
    const numLh = this.md ? 24 : 20;
    const capLh = this.md ? 20 : 16;
    const numFont = this.font(600, this.md ? 16 : 14);
    const capFont = this.font(600, this.md ? 14 : 12);
    const revealed = t >= run.revealAt;
    const rp = revealed ? tailwindEase(clamp01((t - run.revealAt) / TILE_STATE_MS)) : 0;

    const tiles = q.options.map((option, i) => {
      const caption = option.text.trim() ? this.wrap(option.text, capFont, colW) : [];
      return { option, i, caption, h: boxH + 4 + numLh + caption.length * capLh };
    });
    const rows: (typeof tiles)[] = [];
    for (let i = 0; i < tiles.length; i += cols) rows.push(tiles.slice(i, i + cols));
    const rowH = rows.map((row) => Math.max(...row.map((tile) => tile.h)));
    const h = rowH.reduce((a, b) => a + b, 0) + gap * Math.max(0, rows.length - 1);
    const { ctx } = this;

    return {
      w: CW,
      h,
      draw: (x, y) => {
        let ry = y;
        rows.forEach((row, r) => {
          row.forEach(({ option, i, caption }, c) => {
            const tx = x + c * (colW + gap);
            const pickAt = this.pickedAt(run, option.id);
            const isPicked = pickAt !== null && t >= pickAt;
            const showCorrect = revealed && option.correct;
            const showWrong = revealed && isPicked && !option.correct;
            const faded = revealed && !option.correct && !isPicked;
            const pickP = pickAt !== null && t >= pickAt ? tailwindEase(clamp01((t - pickAt) / TILE_STATE_MS)) : 0;
            const tin = this.tileIn(run, i, t);
            const opacity = tin.opacity * (faded ? lerp(1, 0.35, rp) : 1);

            this.withTransform(tx + colW / 2, ry + rowH[r] / 2 + tin.dy, tin.scale, 0, opacity, () => {
              const rad = 6; // rounded-md
              if (showCorrect) {
                this.glowShadow(tx, ry, colW, boxH, rad, 6, 28, withAlpha(this.good, 0.9 * rp));
                this.fillRing(tx, ry, colW, boxH, rad, 4, alpha(this.good, rp));
              } else if (showWrong) {
                this.fillRing(tx, ry, colW, boxH, rad, 4, alpha(this.bad, rp));
              }
              // `ring-4 ring-white/80` while picked and not yet revealed.
              const whiteRing = 0.8 * pickP * (revealed ? 1 - rp : 1);
              if (whiteRing > 0) this.fillRing(tx, ry, colW, boxH, rad, 4, `rgba(255,255,255,${whiteRing})`);

              ctx.save();
              this.rr(tx, ry, colW, boxH, rad);
              ctx.clip();
              ctx.fillStyle = "#ffffff";
              ctx.fillRect(tx, ry, colW, boxH);
              const img = option.media ? this.image(option.media) : null;
              if (faded && rp > 0 && this.filterOK) ctx.filter = `saturate(${lerp(1, 0.5, rp)})`;
              if (img) this.drawContain(img, tx, ry, colW, boxH);
              else if (!option.media)
                this.drawLine("?", tx + colW / 2, ry + boxH / 2 - 12, 24, numFont, INK[500], "center");
              ctx.filter = "none";
              ctx.restore();

              if (revealed && (option.correct || isPicked)) {
                const markFont = this.font(600, 14);
                const mark = option.correct ? "✓" : "✕";
                const mw = this.measure(mark, markFont) + 12;
                this.fillRR(tx + colW - 4 - mw, ry + 4, mw, 14, 7, "rgba(0,0,0,0.5)");
                this.drawLine(mark, tx + colW - 4 - mw / 2, ry + 4, 14, markFont, "#ffffff", "center");
              }

              this.drawLine(String(i + 1), tx + colW / 2, ry + boxH + 4, numLh, numFont, this.promptColor, "center");
              caption.forEach((line, li) =>
                this.drawLine(
                  line,
                  tx + colW / 2,
                  ry + boxH + 4 + numLh + li * capLh,
                  capLh,
                  capFont,
                  this.promptColor,
                  "center",
                ),
              );
            });
          });
          ry += rowH[r] + gap;
        });
      },
    };
  }

  /** The explanation card, with `.animate-pop` from the reveal. */
  private explanationBox(text: string, revealAt: number, t: number, CW: number): Box {
    const font = this.font(400, 14);
    const lines = this.wrap(text, font, CW - 42);
    const h = lines.length * 20 + 34;
    const p = popEase(clamp01((t - revealAt) / POP_IN.durationMs));
    return {
      w: CW,
      h,
      draw: (x, y) => {
        this.withTransform(x + CW / 2, y + h / 2 + 8 * (1 - p), lerp(0.97, 1, p), 0, p, () => {
          this.fillRR(x, y, CW, h, 16, withAlpha(INK[900], 0.8));
          this.strokeRR(x + 0.5, y + 0.5, CW - 1, h - 1, 15.5, INK[600], 1);
          lines.forEach((line, i) =>
            this.drawLine(line, x + CW / 2, y + 17 + i * 20, 20, font, this.explanationColor, "center"),
          );
        });
      },
    };
  }

  /* =============================================================== results */

  /** ResultsScreen. It starts at the top of the page (py-10) and scrolls; the video shows the top. */
  private drawResults(t: number) {
    const { W, md } = this;
    const results = this.timeline.results;
    const maxW = this.narrow ? 416 : 768;
    const CW = Math.min(W, maxW) - 40;
    const x0 = (W - CW) / 2;
    const accuracy = results.total ? results.correctCount / results.total : 0;
    const verdict = accuracyLabel(accuracy);

    const header = this.stack(
      [
        this.textBox(this.quiz.title.toUpperCase(), CW, {
          size: 14,
          lh: 20,
          weight: 600,
          color: INK[400],
          spacing: 2.8,
          align: "center",
        }),
        this.textBox(verdict.title, CW, {
          size: md ? 60 : 48,
          lh: md ? 60 : 48,
          weight: 800,
          color: this.accent,
          family: this.quizFont,
          align: "center",
          balance: true,
        }),
        this.textBox(verdict.blurb, CW, { size: 16, lh: 24, weight: 400, color: INK[300], align: "center" }),
      ],
      8,
      CW,
    );

    const stats: [string, string, boolean][] = [
      ["Score", results.score.toLocaleString(), true],
      ["Correct", `${results.correctCount}/${results.total}`, false],
      ["Accuracy", `${Math.round(accuracy * 100)}%`, false],
      ["Best streak", String(results.bestStreak), false],
    ];
    const cols = this.narrow ? 2 : this.sm ? 4 : 2;
    const sGap = 12;
    const cardW = (CW - sGap * (cols - 1)) / cols;
    const valueSize = md ? 30 : 24;
    const valueLh = md ? 36 : 32;
    const cardH = 16 + valueLh + 4 + 15 + 16 + 2;
    const statRows = Math.ceil(stats.length / cols);
    const statsH = statRows * cardH + (statRows - 1) * sGap;

    const p = popEase(clamp01((t - results.start) / POP_IN.durationMs));
    let y = 40;
    this.withTransform(x0 + CW / 2, y + header.h / 2 + 8 * (1 - p), lerp(0.97, 1, p), 0, p, () => header.draw(x0, y));
    y += header.h + 32;

    stats.forEach(([label, value, highlight], i) => {
      const cx = x0 + (i % cols) * (cardW + sGap);
      const cy = y + Math.floor(i / cols) * (cardH + sGap);
      this.glass(cx, cy, cardW, cardH, 16);
      this.drawLine(
        value,
        cx + cardW / 2,
        cy + 17,
        valueLh,
        this.font(700, valueSize),
        highlight ? this.accent : INK[100],
        "center",
      );
      this.drawLine(
        label.toUpperCase(),
        cx + cardW / 2,
        cy + 17 + valueLh + 4,
        15,
        this.font(400, 10),
        INK[400],
        "center",
        1,
      );
    });
    y += statsH + 32;

    this.breakdownBox(CW).draw(x0, y);
  }

  private breakdownBox(CW: number): Box {
    const runs = this.timeline.questions;
    const promptFont = this.font(500, 16);
    const smallFont = this.font(400, 14);
    const strongFont = this.font(600, 14);
    const label = "Correct answer: ";
    const items = runs.map((run, i) => {
      const q = run.question;
      const points = `+${run.points.toLocaleString()}`;
      const textW = CW - 40 - 28 - 32 - this.measure(points, strongFont);
      const lead = `${i + 1}. `;
      const lines = this.wrap(lead + (q.prompt || "Untitled question"), promptFont, textW);
      const correctText = q.options
        .filter((o) => o.correct)
        .map((o) => o.text || "(image)")
        .join(", ");
      const extra = run.correct
        ? []
        : this.wrap(`${label}${correctText}${run.timedOut ? " · ran out of time" : ""}`, smallFont, textW);
      const h = 32 + Math.max(28, lines.length * 24 + (extra.length ? 4 + extra.length * 20 : 0));
      return { run, points, lines, lead, extra, h };
    });
    const headH = 45;
    const h = headH + items.reduce((sum, item) => sum + item.h, 0) + Math.max(0, items.length - 1);
    const { ctx } = this;

    return {
      w: CW,
      h,
      draw: (x, y) => {
        this.glass(x, y, CW, h, 16);
        ctx.save();
        this.rr(x, y, CW, h, 16);
        ctx.clip();
        this.drawLine("QUESTION BREAKDOWN", x + 20, y + 12, 20, strongFont, INK[300], "left", 1.4);
        ctx.fillStyle = INK[700];
        ctx.fillRect(x, y + headH - 1, CW, 1);
        let iy = y + headH;
        items.forEach((item, idx) => {
          if (idx > 0) {
            ctx.fillStyle = INK[800];
            ctx.fillRect(x, iy, CW, 1);
            iy += 1;
          }
          const ok = item.run.correct;
          const color = ok ? this.good : this.bad;
          ctx.beginPath();
          ctx.arc(x + 34, iy + 32, 14, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(color, 0.2);
          ctx.fill();
          this.drawLine(ok ? "✓" : "✕", x + 34, iy + 22, 20, this.font(700, 14), color, "center");

          const tx = x + 20 + 28 + 16;
          item.lines.forEach((line, li) => {
            if (li === 0 && line.startsWith(item.lead)) {
              const lw = this.measure(item.lead, promptFont);
              this.drawLine(item.lead, tx, iy + 16, 24, promptFont, INK[400], "left");
              this.drawLine(line.slice(item.lead.length), tx + lw, iy + 16, 24, promptFont, INK[100], "left");
            } else {
              this.drawLine(line, tx, iy + 16 + li * 24, 24, promptFont, INK[100], "left");
            }
          });
          let ey = iy + 16 + item.lines.length * 24 + 4;
          for (const line of item.extra) {
            if (line.startsWith(label)) {
              const lw = this.measure(label, smallFont);
              this.drawLine(label, tx, ey, 20, smallFont, INK[300], "left");
              this.drawLine(line.slice(label.length), tx + lw, ey, 20, strongFont, this.good, "left");
            } else {
              this.drawLine(line, tx, ey, 20, smallFont, INK[300], "left");
            }
            ey += 20;
          }
          this.drawLine(item.points, x + CW - 20, iy + 18, 20, strongFont, INK[300], "right");
          iy += item.h;
        });
        ctx.restore();
      },
    };
  }

  /* ================================================================== cues */

  private drawCue(instance: CueInstance, local: number) {
    switch (instance.cue.animation) {
      case "countdown":
        return this.drawCountdown(instance, local);
      case "stars":
        return this.drawStars(instance.hold, local);
      case "pulse-ring":
        return this.drawPulseRing(instance.hold, local);
      case "shake":
        return this.drawShake(instance.hold, local);
      case "stamp":
        return this.drawStamp(instance.hold, local);
      case "image":
        return this.drawCueImage(instance.cue, instance.hold, local);
      default:
        // "confetti" draws through drawConfetti; null draws nothing.
        return;
    }
  }

  /** CuePlayer's Countdown: dimmed, blurred backdrop and 3-2-1-Go! beats. */
  private drawCountdown(instance: CueInstance, local: number) {
    const { ctx, W, H } = this;
    this.backdropBlur(4);
    ctx.fillStyle = withAlpha(INK[950], 0.7);
    ctx.fillRect(0, 0, W, H);

    const beats = COUNTDOWN_BEATS;
    const perBeat = instance.hold / beats.length;
    const d = countdownBeatTransitionS(perBeat) * 1000;
    const beat = Math.min(beats.length - 1, Math.floor(local / perBeat));
    const since = local - beat * perBeat;
    const e = cubicBezier([0.2, 0.8, 0.3, 1]);
    let text = beats[beat];
    let sc: number;
    let op: number;
    if (beat === 0) {
      const p = e(clamp01(since / d));
      sc = lerp(0.4, 1, p);
      op = p;
    } else if (since < d) {
      // AnimatePresence mode="wait": the previous beat leaves first.
      const p = e(clamp01(since / d));
      text = beats[beat - 1];
      sc = lerp(1, 1.6, p);
      op = 1 - p;
    } else {
      const p = e(clamp01((since - d) / d));
      sc = lerp(0.4, 1, p);
      op = p;
    }
    // font-size: clamp(5rem, 22vw, 16rem)
    const size = Math.min(256, Math.max(80, 0.22 * W));
    this.withTransform(W / 2, H / 2, sc, 0, op, () => {
      this.drawLine(
        text,
        W / 2,
        H / 2 - size * 0.75,
        size * 1.5,
        this.font(800, size, this.quizFont),
        this.accent,
        "center",
      );
    });
  }

  private drawStars(hold: number, local: number) {
    const { W, H } = this;
    const font = this.font(400, 30);
    const w = this.measure("★", font);
    STAR_LANES.forEach((left, i) => {
      const lt = local - (i % 5) * 120;
      if (lt < 0) return;
      const p = clamp01(lt / hold);
      const y = lerp(-0.15 * H, 1.1 * H, easeIn(p));
      const op = keyframes([0, 1, 1, 0], p, easeIn);
      const rot = lerp(0, 220, easeIn(p));
      const x = (left / 100) * W;
      this.withTransform(x + w / 2, y + 18, 1, rot, op, () => this.drawLine("★", x, y, 36, font, this.accent, "left"));
    });
  }

  private drawPulseRing(hold: number, local: number) {
    const { ctx, W, H } = this;
    for (const delay of [0, 180]) {
      const e = easeOut(clamp01((local - delay) / hold));
      const sc = lerp(0.2, 2.2, e);
      ctx.save();
      ctx.globalAlpha *= lerp(0.7, 0, e);
      ctx.translate(W / 2, H / 2);
      ctx.scale(sc, sc);
      ctx.beginPath();
      ctx.arc(0, 0, 94, 0, Math.PI * 2); // h-48 w-48 border-4
      ctx.lineWidth = 4;
      ctx.strokeStyle = this.accent;
      ctx.stroke();
      ctx.restore();
    }
  }

  private drawShake(hold: number, local: number) {
    const { ctx, W, H } = this;
    const p = clamp01(local / hold);
    const x = keyframes([0, -14, 12, -8, 5, 0], p, easeOut);
    ctx.save();
    ctx.globalAlpha *= lerp(0.35, 0, easeOut(p));
    ctx.fillStyle = withAlpha(this.accent, 0.16); // --accent-soft
    ctx.fillRect(x, 0, W, H);
    ctx.restore();
  }

  private drawStamp(hold: number, local: number) {
    const { W, H } = this;
    const p = clamp01(local / hold);
    const times = [0, 0.25, 0.4, 1];
    const sc = keyframes([2.4, 0.9, 1, 1], p, easeOut, times);
    const op = keyframes([0, 1, 1, 0], p, easeOut, times);
    const rot = lerp(-18, -12, easeOut(p));
    const font = this.font(800, 60);
    const glyphW = this.measure("★", font, 6);
    const w = glyphW + 80 + 16;
    const h = 60 + 32 + 16;
    this.withTransform(W / 2, H / 2, sc, rot, op, () => {
      const x = W / 2 - w / 2;
      const y = H / 2 - h / 2;
      this.fillRing(x + 8, y + 8, w - 16, h - 16, 16, 8, this.accent);
      this.drawLine("★", x + 48, y + 24, 60, font, this.accent, "left", 6);
    });
  }

  private drawCueImage(cue: Cue, hold: number, local: number) {
    const img = cue.media ? this.image(cue.media) : null;
    if (!img) return;
    const { ctx, W, H } = this;
    const p = clamp01(local / hold);
    const times = [0, 0.15, 0.8, 1];
    const sc = keyframes([0.6, 1, 1, 0.95], p, easeOut, times);
    const op = keyframes([0, 1, 1, 0], p, easeOut, times);
    const k = Math.min(1, (0.7 * W) / img.width, (0.6 * H) / img.height);
    const w = img.width * k;
    const h = img.height * k;
    const x = W / 2 - w / 2;
    const y = H / 2 - h / 2;
    this.withTransform(W / 2, H / 2, sc, 0, op, () => {
      ctx.save();
      this.rr(x, y, w, h, 24);
      ctx.clip();
      ctx.drawImage(img.source, x, y, w, h);
      ctx.restore();
    });
  }

  /* -------------------------------------------------------------- confetti */

  /**
   * canvas-confetti's physics (randomPhysics / updateFetti), stepped at its
   * 60 ticks a second with a seeded random source. The library draws on a
   * viewport-sized canvas above everything, so this is drawn last.
   */
  private drawConfetti(t: number) {
    const { ctx, W, H } = this;
    for (const burst of this.timeline.confetti) {
      const dt = t - burst.at;
      if (dt < 0) continue;
      const updates = Math.floor((dt * 60) / 1000) + 1;
      const { preset } = burst;
      if (updates > preset.ticks) continue;
      const rand = mulberry32(burst.seed * 7919);
      for (const origin of preset.bursts) {
        const radAngle = (origin.angle * Math.PI) / 180;
        const radSpread = (preset.spread * Math.PI) / 180;
        for (let n = preset.particleCount - 1; n >= 0; n--) {
          const circle = rand() < 0.5;
          let x = origin.x * W;
          let y = origin.y * H;
          let wobble = rand() * 10;
          const wobbleSpeed = Math.min(0.11, rand() * 0.1 + 0.05);
          let velocity = preset.startVelocity * 0.5 + rand() * preset.startVelocity;
          const angle2D = -radAngle + (0.5 * radSpread - rand() * radSpread);
          let tiltAngle = (rand() * (0.75 - 0.25) + 0.25) * Math.PI;
          const jitter = mulberry32(Math.floor(rand() * 1e9));
          let random = 2;
          let wobbleX = x;
          let wobbleY = y;
          for (let tick = 0; tick < updates; tick++) {
            x += Math.cos(angle2D) * velocity;
            y += Math.sin(angle2D) * velocity + 3; // gravity 1 × 3
            velocity *= 0.9; // decay
            wobble += wobbleSpeed;
            wobbleX = x + 10 * Math.cos(wobble);
            wobbleY = y + 10 * Math.sin(wobble);
            tiltAngle += 0.1;
            random = jitter() + 2;
          }
          const progress = (updates - 1) / preset.ticks;
          const tiltSin = Math.sin(tiltAngle);
          const tiltCos = Math.cos(tiltAngle);
          const color = CONFETTI_COLORS[n % CONFETTI_COLORS.length];
          const x1 = x + random * tiltCos;
          const y1 = y + random * tiltSin;
          const x2 = wobbleX + random * tiltCos;
          const y2 = wobbleY + random * tiltSin;
          ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, ${1 - progress})`;
          ctx.beginPath();
          if (circle) {
            ctx.ellipse(
              x,
              y,
              Math.abs(x2 - x1) * 0.6,
              Math.abs(y2 - y1) * 0.6,
              (Math.PI / 10) * wobble,
              0,
              2 * Math.PI,
            );
          } else {
            ctx.moveTo(x, y);
            ctx.lineTo(wobbleX, y1);
            ctx.lineTo(x2, y2);
            ctx.lineTo(x1, wobbleY);
          }
          ctx.closePath();
          ctx.fill();
        }
      }
    }
  }

  /* =============================================================== helpers */

  /** `backdrop-blur-sm` behind the countdown. Skipped where canvas filters aren't supported (Safari). */
  private backdropBlur(px: number) {
    if (!this.filterOK) return;
    const { canvas, ctx } = this;
    if (!this.scratch) {
      this.scratch = document.createElement("canvas");
      this.scratch.width = canvas.width;
      this.scratch.height = canvas.height;
    }
    const sctx = this.scratch.getContext("2d");
    if (!sctx) return;
    sctx.drawImage(canvas, 0, 0);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = `blur(${px * this.scale}px)`;
    ctx.drawImage(this.scratch, 0, 0);
    ctx.restore();
    ctx.filter = "none";
  }

  /** `.glass`: ink-850 at 82% with an ink-600/70 hairline. (Its backdrop blur is left out.) */
  private glass(x: number, y: number, w: number, h: number, r: number) {
    this.fillRR(x, y, w, h, r, withAlpha(INK[850], 0.82));
    this.strokeRR(x + 0.5, y + 0.5, w - 1, h - 1, r - 0.5, withAlpha(INK[600], 0.7), 1);
  }

  private withTransform(cx: number, cy: number, scale: number, rotateDeg: number, opacity: number, draw: () => void) {
    if (opacity <= 0.001) return;
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha *= opacity;
    if (scale !== 1 || rotateDeg !== 0) {
      ctx.translate(cx, cy);
      if (rotateDeg) ctx.rotate((rotateDeg * Math.PI) / 180);
      if (scale !== 1) ctx.scale(scale, scale);
      ctx.translate(-cx, -cy);
    }
    draw();
    ctx.restore();
  }

  private rrPath(x: number, y: number, w: number, h: number, r: number) {
    const { ctx } = this;
    const rad = Math.max(0, Math.min(r, w / 2, h / 2));
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }

  private rr(x: number, y: number, w: number, h: number, r: number) {
    this.ctx.beginPath();
    this.rrPath(x, y, w, h, r);
  }

  private fillRR(x: number, y: number, w: number, h: number, r: number, color: string) {
    if (w <= 0 || h <= 0) return;
    this.rr(x, y, w, h, r);
    this.ctx.fillStyle = color;
    this.ctx.fill();
  }

  private strokeRR(x: number, y: number, w: number, h: number, r: number, color: string, width: number) {
    this.rr(x, y, w, h, r);
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = width;
    this.ctx.stroke();
  }

  /** A `box-shadow: 0 0 0 {width}px` ring hugging a rounded box from outside. */
  private fillRing(x: number, y: number, w: number, h: number, r: number, width: number, color: string) {
    const { ctx } = this;
    ctx.beginPath();
    this.rrPath(x - width, y - width, w + 2 * width, h + 2 * width, r + width);
    this.rrPath(x, y, w, h, r);
    ctx.fillStyle = color;
    ctx.fill("evenodd");
  }

  /** `box-shadow: 0 0 {blur}px -{spread}px color` — the reveal glow. */
  private glowShadow(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    spread: number,
    blur: number,
    color: string,
  ) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = color;
    // Canvas shadowBlur is in device pixels and ignores the transform.
    ctx.shadowBlur = blur * this.scale;
    this.rr(x + spread, y + spread, w - 2 * spread, h - 2 * spread, Math.max(0, r - spread));
    ctx.fillStyle = color;
    ctx.fill();
    ctx.restore();
  }

  private image(ref: MediaRef): LoadedImage | null {
    return this.assets.images.get(mediaKey(ref)) ?? null;
  }

  private drawContain(img: LoadedImage, x: number, y: number, w: number, h: number) {
    const k = Math.min(w / img.width, h / img.height);
    const dw = img.width * k;
    const dh = img.height * k;
    this.ctx.drawImage(img.source, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  private drawCover(img: LoadedImage, x: number, y: number, w: number, h: number) {
    const k = Math.max(w / img.width, h / img.height);
    const sw = w / k;
    const sh = h / k;
    this.ctx.drawImage(img.source, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
  }

  /** An image laid out like the stage's <img>: natural size, shrunk to fit the width and max-height. */
  private mediaBox(ref: MediaRef | undefined, maxW: number, maxH: number, radius: number): Box | null {
    if (!ref) return null;
    const img = this.image(ref);
    const nw = img?.width ?? (ref.kind === "stored" ? ref.w : 0);
    const nh = img?.height ?? (ref.kind === "stored" ? ref.h : 0);
    if (!nw || !nh) return null;
    const k = Math.min(1, maxW / nw, maxH / nh);
    const w = nw * k;
    const h = nh * k;
    return {
      w,
      h,
      draw: (x, y) => {
        const { ctx } = this;
        ctx.save();
        this.rr(x, y, w, h, radius);
        ctx.clip();
        if (img) ctx.drawImage(img.source, x, y, w, h);
        else {
          ctx.fillStyle = INK[800];
          ctx.fillRect(x, y, w, h);
        }
        ctx.restore();
      },
    };
  }

  private centered(box: Box, width: number): Box {
    return { w: width, h: box.h, draw: (x, y) => box.draw(x + (width - box.w) / 2, y) };
  }

  private stack(boxes: Box[], gap: number, width: number): Box {
    const h = boxes.reduce((sum, b) => sum + b.h, 0) + gap * Math.max(0, boxes.length - 1);
    return {
      w: width,
      h,
      draw: (x, y) => {
        let cy = y;
        for (const b of boxes) {
          b.draw(x, cy);
          cy += b.h + gap;
        }
      },
    };
  }

  /* ------------------------------------------------------------------ text */

  private font(weight: number, size: number, family = this.assets.fonts.sans): string {
    return `${weight} ${size}px ${family}`;
  }

  private metrics(font: string) {
    let m = this.metricCache.get(font);
    if (!m) {
      this.ctx.font = font;
      const tm = this.ctx.measureText("Hg");
      const size = parseFloat(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? "16");
      m = {
        ascent: Number.isFinite(tm.fontBoundingBoxAscent) ? tm.fontBoundingBoxAscent : size * 0.8,
        descent: Number.isFinite(tm.fontBoundingBoxDescent) ? tm.fontBoundingBoxDescent : size * 0.2,
      };
      this.metricCache.set(font, m);
    }
    return m;
  }

  private measure(text: string, font: string, spacing = 0): number {
    this.ctx.font = font;
    const base = this.ctx.measureText(text).width;
    return spacing ? base + spacing * Array.from(text).length : base;
  }

  /** Greedy wrap at spaces, breaking words that can't fit on their own (`break-words`). */
  private wrap(text: string, font: string, maxWidth: number, spacing = 0): string[] {
    const key = `${font}|${maxWidth.toFixed(2)}|${spacing}|${text}`;
    const cached = this.wrapCache.get(key);
    if (cached) return cached;
    const words = text.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (this.measure(candidate, font, spacing) <= maxWidth) {
        current = candidate;
        continue;
      }
      if (current) lines.push(current);
      current = "";
      if (this.measure(word, font, spacing) <= maxWidth) {
        current = word;
        continue;
      }
      let piece = "";
      for (const ch of Array.from(word)) {
        if (piece && this.measure(piece + ch, font, spacing) > maxWidth) {
          lines.push(piece);
          piece = ch;
        } else {
          piece += ch;
        }
      }
      current = piece;
    }
    if (current || !lines.length) lines.push(current);
    if (this.wrapCache.size > 4000) this.wrapCache.clear();
    this.wrapCache.set(key, lines);
    return lines;
  }

  /** `text-wrap: balance`: the narrowest width that keeps the same number of lines. */
  private balance(text: string, font: string, maxWidth: number): string[] {
    const lines = this.wrap(text, font, maxWidth);
    if (lines.length < 2) return lines;
    let lo = maxWidth / 2;
    let hi = maxWidth;
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2;
      if (this.wrap(text, font, mid).length === lines.length) hi = mid;
      else lo = mid;
    }
    return this.wrap(text, font, hi);
  }

  private textBox(
    text: string,
    maxWidth: number,
    o: {
      size: number;
      lh: number;
      weight: number;
      color: string;
      family?: string;
      align?: Align;
      spacing?: number;
      balance?: boolean;
    },
  ): Box {
    const font = this.font(o.weight, o.size, o.family);
    const spacing = o.spacing ?? 0;
    const lines = o.balance ? this.balance(text, font, maxWidth) : this.wrap(text, font, maxWidth, spacing);
    const align = o.align ?? "left";
    return {
      w: maxWidth,
      h: lines.length * o.lh,
      draw: (x, y) => {
        const ax = align === "center" ? x + maxWidth / 2 : align === "right" ? x + maxWidth : x;
        lines.forEach((line, i) => this.drawLine(line, ax, y + i * o.lh, o.lh, font, o.color, align, spacing));
      },
    };
  }

  /** One line of text in a CSS line box whose top edge is `top` (half-leading above and below). */
  private drawLine(
    text: string,
    x: number,
    top: number,
    lineHeight: number,
    font: string,
    color: string,
    align: Align,
    spacing = 0,
  ) {
    if (!text) return;
    const { ctx } = this;
    const m = this.metrics(font);
    const baseline = top + (lineHeight - (m.ascent + m.descent)) / 2 + m.ascent;
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textBaseline = "alphabetic";
    if (!spacing) {
      ctx.textAlign = align;
      ctx.fillText(text, x, baseline);
      ctx.textAlign = "left";
      return;
    }
    // letter-spacing, drawn glyph by glyph so it works where ctx.letterSpacing doesn't.
    const width = this.measure(text, font, spacing);
    let cx = align === "center" ? x - width / 2 : align === "right" ? x - width : x;
    ctx.textAlign = "left";
    for (const ch of Array.from(text)) {
      ctx.fillText(ch, cx, baseline);
      cx += ctx.measureText(ch).width + spacing;
    }
  }
}

/** Complementary error function (Abramowitz–Stegun 7.1.26 family), for the soft blob edges. */
function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const poly =
    -z * z -
    1.26551223 +
    t *
      (1.00002368 +
        t *
          (0.37409196 +
            t *
              (0.09678418 +
                t *
                  (-0.18628806 +
                    t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))));
  const r = t * Math.exp(poly);
  return x >= 0 ? r : 2 - r;
}
