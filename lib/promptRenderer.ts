import type { Question, Theme } from "../types/quiz.ts";
import { layoutPrompt, promptFontSize, promptGraphemes, promptLetterSpacing, wordArtInk, wordArtStyleOf, type PromptLine } from "./promptText.ts";
import { promptAnimationElapsed, promptLetterScale, promptParagraphLines, promptPathPose, promptSegmentPose, promptSegmentProgress, promptSegments } from "./promptDesign.ts";
import { themeInk } from "./themeInk.ts";
import { withAlpha } from "./color.ts";

/** One design coordinate system, scaled as a whole on every surface. */
export const PROMPT_DESIGN_WIDTH = 728;
type Context = CanvasRenderingContext2D;
export interface PromptPicture { source: CanvasImageSource; width: number; height: number }
interface Glyph { text: string; index: number; x: number; y: number; size: number; angle: number; width: number }

/** Browser and video both paint this layout, including frames, paths and animation. */
export function createPromptDrawing(ctx: Context, question: Pick<Question, "prompt" | "promptStyle">, theme: Theme, family: string) {
  const style = question.promptStyle ?? {};
  const text = question.prompt || "Untitled question";
  const size = promptFontSize(style, 30);
  const spacing = promptLetterSpacing(style, 30);
  const lineHeight = size * (style.lineSpacing ?? 1.375);
  const frame = style.box?.shape && style.box.shape !== "none" ? style.box : undefined;
  const padding = frame?.padding ?? (frame ? 16 : 0);
  const artName = wordArtStyleOf(style.wordArt);
  const defaults = artName ? wordArtInk(theme.accent, theme.surface, artName) : null;
  const art = defaults ? { ...defaults, ...Object.fromEntries(Object.entries(style.wordArtColors ?? {}).filter(([, value]) => value !== undefined)) } : null;
  const ink = themeInk(theme);
  const color = question.prompt ? art?.fill ?? theme.promptColor ?? ink[100] : ink[500];
  const font = (px: number) => `${style.italic ? "italic " : ""}${style.bold === false ? 400 : 700} ${px}px ${family}`;
  const measure = (sample: string, px = size) => {
    ctx.font = font(px);
    ctx.letterSpacing = "0px";
    return ctx.measureText(sample).width;
  };
  // Leave room for decorations inside the canvas instead of cropping shadows.
  const ring = art ? Math.max(1, Math.round(size * 0.06 * art.strokeWidth)) : 0;
  const drop = art && art.drop ? Math.max(2, Math.round(size * 0.12 * art.drop)) : 0;
  const inset = Math.max(2, ring + (art ? size * art.blur + drop * art.layers : 0));
  const outer = frame?.shadow ? 30 : frame?.shape === "speech" ? 14 : 2;
  const boxWidth = frame?.shape === "circle" ? Math.min(PROMPT_DESIGN_WIDTH - outer * 2, Math.max(160, size * 5)) : PROMPT_DESIGN_WIDTH - outer * 2;
  const available = Math.max(16, boxWidth - 2 * (padding + inset));
  const shape = style.textShape ?? "straight";
  const shaped = shape !== "straight" || (style.letterShape && style.letterShape !== "uniform");
  const glyphs: Glyph[] = [];
  let lines: PromptLine[] = [];
  let textHeight = lineHeight;
  let textScale = 1;
  let textWidth = available;

  if (shaped) {
    const chars = promptGraphemes(text.replaceAll("\n", " "));
    const sizes = chars.map((_, i) => size * promptLetterScale(style.letterShape, chars.length > 1 ? i / (chars.length - 1) : 0.5));
    const advances = chars.map((char, i) => Math.max(1, measure(char, sizes[i]) + spacing));
    const total = advances.reduce((sum, width) => sum + width, 0);
    const width = Math.max(size * 3, total + size * 2);
    const height = shape === "circle" ? Math.max(size, (width - size) / (2 * Math.PI)) * 2 + size * 3
      : shape === "spiral" ? size * 8 : shape === "straight" ? size * 2 : size * 5;
    let x = (width - total) / 2;
    chars.forEach((char, i) => {
      const at = (x + advances[i] / 2 - size / 2) / (width - size);
      const pose = promptPathPose(shape, at, width - size, size, style.curve ?? 50);
      glyphs.push({ text: char, index: i, size: sizes[i], width: advances[i] - spacing,
        x: shape === "straight" ? x + advances[i] / 2 : pose.x + size / 2,
        y: shape === "circle" ? pose.y + size * 1.5 : shape === "spiral" ? pose.y + size * 2 : pose.y + height / 2,
        angle: pose.angle });
      x += advances[i];
    });
    textScale = Math.min(1, available / width);
    textWidth = width * textScale;
    textHeight = height * textScale;
  } else {
    const widthOf = (sample: string) => measure(sample) + Math.max(0, promptGraphemes(sample).length - 1) * spacing;
    if (style.paragraphShape && style.paragraphShape !== "normal") {
      lines = promptParagraphLines(text, style.paragraphShape, available / Math.max(1, measure("n") + spacing));
    } else {
      lines = layoutPrompt(text, widthOf, available);
      // Match the balanced title layout, while retaining authored line breaks.
      if (!text.includes("\n") && lines.length > 1) {
        let low = available / 2, high = available;
        for (let i = 0; i < 12; i++) {
          const mid = (low + high) / 2;
          if (layoutPrompt(text, widthOf, mid).length === lines.length) high = mid;
          else low = mid;
        }
        lines = layoutPrompt(text, widthOf, high);
      }
    }
    textHeight = Math.max(lineHeight, lines.length * lineHeight);
  }
  const boxHeight = Math.max(frame?.shape === "circle" ? boxWidth : 0, textHeight + 2 * (padding + inset));
  const height = boxHeight + outer * 2;
  const segments = style.textAnimation ? promptSegments(text, style.textAnimation.unit) : [];

  function paintFrame(picture?: PromptPicture) {
    if (!frame) return;
    const x = outer, y = outer, w = boxWidth, h = boxHeight;
    const traceFrame = () => {
    ctx.beginPath();
    if (frame.shape === "circle") ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    else if (frame.shape === "banner") {
      ctx.moveTo(x + w * 0.05, y); ctx.lineTo(x + w * 0.95, y); ctx.lineTo(x + w, y + h / 2);
      ctx.lineTo(x + w * 0.95, y + h); ctx.lineTo(x + w * 0.05, y + h); ctx.lineTo(x, y + h / 2); ctx.closePath();
    } else ctx.roundRect(x, y, w, h, frame.shape === "rectangle" ? 0 : frame.shape === "pill" ? h / 2 : frame.shape === "card" ? 16 : 8);
    };
    traceFrame();
    const fill = withAlpha(frame.fill ?? theme.surface, frame.opacity ?? 0.85);
    ctx.fillStyle = fill;
    if (frame.backgroundStyle === "gradient") {
      const angle = (frame.gradientAngle ?? 135) * Math.PI / 180;
      const dx = Math.sin(angle) * w / 2, dy = -Math.cos(angle) * h / 2;
      const gradient = ctx.createLinearGradient(x + w / 2 - dx, y + h / 2 - dy, x + w / 2 + dx, y + h / 2 + dy);
      gradient.addColorStop(0, fill); gradient.addColorStop(1, withAlpha(frame.gradientTo ?? theme.accent, frame.opacity ?? 0.85));
      ctx.fillStyle = gradient;
    }
    ctx.save();
    if (frame.shadow) { ctx.shadowColor = "#00000059"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12; }
    ctx.fill(); ctx.restore();
    if (frame.backgroundStyle === "image" && picture) {
      ctx.save(); ctx.clip();
      const scale = Math.max(w / picture.width, h / picture.height);
      ctx.drawImage(picture.source, x + (w - picture.width * scale) / 2, y + (h - picture.height * scale) / 2, picture.width * scale, picture.height * scale);
      ctx.fillStyle = fill; ctx.fill(); ctx.restore();
    }
    if (frame.backgroundStyle === "texture") {
      ctx.save(); ctx.clip(); ctx.strokeStyle = "#ffffff10"; ctx.lineWidth = 2;
      for (let offset = -h; offset < w + h; offset += 7) {
        ctx.beginPath(); ctx.moveTo(x + offset, y); ctx.lineTo(x + offset + h, y + h); ctx.stroke();
      }
      ctx.restore();
      // Restore the frame path after drawing the texture's stripes.
      traceFrame();
    }
    if ((frame.borderWidth ?? 2) > 0) {
      ctx.strokeStyle = frame.border ?? withAlpha(theme.accent, 0.7); ctx.lineWidth = frame.borderWidth ?? 2;
      ctx.setLineDash(frame.borderStyle === "dashed" ? [10, 6] : frame.borderStyle === "dotted" ? [2, 5] : []); ctx.stroke(); ctx.setLineDash([]);
    }
    if (frame.shape === "speech") {
      ctx.beginPath(); ctx.moveTo(x + w * 0.25 - 8, y + h - 1); ctx.lineTo(x + w * 0.25, y + h + 10); ctx.lineTo(x + w * 0.25 + 8, y + h - 1);
      ctx.fillStyle = fill; ctx.fill();
      if ((frame.borderWidth ?? 2) > 0) ctx.stroke();
    }
  }

  function fillPaint(): string | CanvasGradient {
    if (!style.fillEffect || style.fillEffect === "solid") return color;
    const g = style.fillEffect === "gradient" ? ctx.createLinearGradient(0, 0, available, textHeight * 0.35) : ctx.createLinearGradient(0, 0, 0, textHeight);
    const stops: [number, string][] = style.fillEffect === "metallic" ? [[0, "#fff7c2"], [0.45, "#eab308"], [0.53, "#78350f"], [1, "#fef08a"]]
      : style.fillEffect === "chalk" ? [[0, "#ffffff"], [0.5, "#cbd5e1"], [1, "#ffffff"]]
      : [[0, art?.fill ?? theme.accent], [0.5, "#ffffff"], [1, art?.fill ?? theme.accent]];
    stops.forEach(([at, color]) => g.addColorStop(at, color));
    return g;
  }

  function drawText(sample: string, x: number, y: number, px: number, fill: string | CanvasGradient) {
    ctx.font = font(px); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
    ctx.letterSpacing = `${spacing}px`;
    const metrics = ctx.measureText(sample);
    const baseline = y + (metrics.fontBoundingBoxAscent ?? px * 0.8) / 2 - (metrics.fontBoundingBoxDescent ?? px * 0.2) / 2;
    if (art) {
      // Same eight-offset outline and layered shadows as main's Word Art CSS.
      const rim = Math.max(1, Math.round(px * 0.06 * art.strokeWidth));
      const offset = art.drop ? Math.max(2, Math.round(px * 0.12 * art.drop)) : 0;
      ctx.save();
      ctx.fillStyle = art.shadow;
      ctx.shadowColor = art.shadow; ctx.shadowBlur = Math.round(px * art.blur);
      for (let layer = art.layers; layer >= 1; layer--) ctx.fillText(sample, x + offset * layer, baseline + offset * layer);
      ctx.shadowBlur = 0;
      ctx.fillStyle = art.stroke;
      if (art.strokeWidth > 0) {
        const rings = art.strokeWidth > 1.4 ? [rim, Math.max(1, Math.round(rim * 0.55))] : [rim];
        for (const r of rings) for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r], [r, r], [-r, r], [r, -r], [-r, -r]]) ctx.fillText(sample, x + dx, baseline + dy);
      }
      ctx.restore();
    }
    ctx.fillStyle = fill; ctx.fillText(sample, x, baseline);
    if (style.underline) { ctx.fillStyle = fill; ctx.fillRect(x, baseline + px * 0.1, metrics.width, Math.max(1, px * 0.055)); }
    ctx.letterSpacing = "0px";
  }

  return { width: PROMPT_DESIGN_WIDTH, height, draw(elapsed = Infinity, typed = Infinity, picture?: PromptPicture) {
    ctx.save();
    const centered = (PROMPT_DESIGN_WIDTH - boxWidth) / 2 - outer;
    ctx.translate(centered, 0);
    paintFrame(picture);
    ctx.translate(outer + padding + inset, outer + (boxHeight - textHeight) / 2);
    const fill = fillPaint();
    const animation = style.textAnimation;
    const phase = animation ? promptAnimationElapsed(text, animation, elapsed) : Infinity;
    const withAnimation = (start: number, x: number, y: number, width: number, draw: () => void) => {
      const index = segments.findIndex((s) => start >= s.start && start < s.end);
      if (!animation || index < 0) { draw(); return; }
      const pose = promptSegmentPose(animation.effect, promptSegmentProgress(animation, index, phase), size);
      ctx.save(); ctx.globalAlpha *= pose.opacity;
      ctx.translate(x + width / 2 + pose.x, y + pose.y);
      ctx.scale(pose.scale, pose.scale * Math.max(0.01, Math.cos(pose.rotateX * Math.PI / 180)));
      ctx.translate(-x - width / 2, -y); draw(); ctx.restore();
    };
    if (shaped) {
      ctx.translate((available - textWidth) / 2, 0); ctx.scale(textScale, textScale);
      glyphs.forEach((glyph) => {
        if (glyph.index >= typed) return;
        withAnimation(glyph.index, glyph.x - glyph.width / 2, glyph.y, glyph.width, () => {
          ctx.save(); ctx.translate(glyph.x, glyph.y); ctx.rotate(glyph.angle);
          drawText(glyph.text, -glyph.width / 2, 0, glyph.size, fill); ctx.restore();
        });
      });
    } else {
      lines.forEach((line, row) => {
        const chars = promptGraphemes(line.text);
        const width = measure(line.text) + Math.max(0, chars.length - 1) * spacing;
        const left = style.align === "left" ? 0 : style.align === "right" ? available - width : (available - width) / 2;
        const y = (row + 0.5) * lineHeight;
        const parts = animation ? segments : [{ text, start: 0, end: Infinity }];
        parts.forEach((segment) => {
          const from = Math.max(line.start, segment.start), to = Math.min(line.start + chars.length, segment.end, typed);
          if (to <= from) return;
          const prefix = chars.slice(0, from - line.start).join("");
          const part = chars.slice(from - line.start, to - line.start).join("");
          const x = left + measure(prefix) + promptGraphemes(prefix).length * spacing;
          withAnimation(from, x, y, measure(part), () => drawText(part, x, y, size, fill));
        });
      });
    }
    ctx.restore();
  } };
}
