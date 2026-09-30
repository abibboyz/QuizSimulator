import type { LoopMotion, LoopStyle, LoopMotionSet, Option, Question, QuizSettings } from "../types/quiz.ts";

export const LOOP_STYLES: { id: LoopStyle; label: string }[] = [
  { id: "none", label: "Off" }, { id: "hop", label: "Slow hop" },
  { id: "bounce", label: "Bounce" }, { id: "float", label: "Float" },
  { id: "sideways", label: "Side to side" }, { id: "rock", label: "Rock from the bottom" },
  { id: "wiggle", label: "Wiggle" }, { id: "pulse", label: "Gentle pulse" },
  { id: "jelly", label: "Jelly wobble" }, { id: "seesaw", label: "Seesaw" },
  { id: "orbit", label: "Circular drift" },
  { id: "dance", label: "Dance" }, { id: "butterfly", label: "Butterfly flight" },
  { id: "flutter", label: "Butterfly flutter · in place" }, { id: "shuffle", label: "Shuffle dance" },
  { id: "boomerang", label: "Boomerang" }, { id: "figure-eight", label: "Figure-eight flight" },
  { id: "heartbeat", label: "Heartbeat" }, { id: "leaf", label: "Leaf drift" },
  { id: "pendulum", label: "Pendulum" }, { id: "rubberband", label: "Rubber band" },
  { id: "shake", label: "Shake" }, { id: "skipping", label: "Skipping" },
  { id: "spiral", label: "Spiral float" }, { id: "swing", label: "Swing" },
  { id: "tiptoe", label: "Tiptoe" }, { id: "wave", label: "Wave" },
  { id: "zigzag", label: "Zigzag" },
].sort((a, b) => a.label.localeCompare(b.label)) as { id: LoopStyle; label: string }[];
export const LOOP_SPEEDS = [
  { durationMs: 2000, label: "Playful" },
  { durationMs: 1400, label: "Energetic" },
  { durationMs: 900, label: "Supercharged" },
  { durationMs: 600, label: "Turbo" },
] as const;

export const DEFAULT_LOOP: LoopMotion = { style: "none", durationMs: 2000, amount: 6 };
const bound = (v: number | undefined, fallback: number, min: number, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
export function normalizeLoop(value?: Partial<LoopMotion>): LoopMotion {
  return {
    style: LOOP_STYLES.some((s) => s.id === value?.style) ? value!.style! : "none",
    // Keep imported and older saved values inside the currently offered
    // playful-to-turbo range as well, so every renderer behaves identically.
    durationMs: bound(value?.durationMs, 2000, 600, 2000),
    amount: bound(value?.amount, 6, 0, 10),
    ...(value?.playback === "loop" || value?.playback === "hold" ? { playback: value.playback } : {}),
    ...(value?.secondary && LOOP_STYLES.some((s) => s.id === value.secondary) ? { secondary: value.secondary } : {}),
    ...(value?.direction && ["same", "reverse", "alternate"].includes(value.direction) ? { direction: value.direction } : {}),
    ...(typeof value?.pauseOnInteract === "boolean" ? { pauseOnInteract: value.pauseOnInteract } : {}),
  };
}
/** Whole-setting inheritance: an explicit Off overrides any parent motion. */
export function resolveLoops(settings: Pick<QuizSettings, "loopMotion">, question?: Question): Required<LoopMotionSet> {
  return {
    question: normalizeLoop(question?.loopMotion?.question ?? settings.loopMotion?.question),
    answers: normalizeLoop(question?.loopMotion?.answers ?? settings.loopMotion?.answers),
  };
}
export function answerLoop(parent: LoopMotion, option: Pick<Option, "loopMotion">): LoopMotion {
  return normalizeLoop(option.loopMotion ?? parent);
}
function singlePose(value: LoopMotion, elapsedMs: number) {
  const motion = normalizeLoop(value);
  const angle = (Math.max(0, elapsedMs) % motion.durationMs) / motion.durationMs * Math.PI * 2;
  const wave = Math.sin(angle), a = motion.amount;
  const pose = { x: 0, y: 0, rotate: 0, sx: 1, sy: 1 };
  if (angle === 0) return pose;
  switch (motion.style) {
    case "hop": pose.y = -Math.max(0, wave) * a; break;
    case "bounce": pose.y = -Math.abs(wave) * a; break;
    case "float": pose.y = -wave * a; break;
    case "sideways": pose.x = wave * a; break;
    case "rock": pose.rotate = wave * a * 0.5; break;
    case "wiggle": pose.rotate = Math.sin(angle * 2) * a * 0.35; break;
    case "pulse": pose.sx = pose.sy = 1 + wave * a * 0.004; break;
    case "jelly": pose.sx = 1 + wave * a * 0.004; pose.sy = 1 - wave * a * 0.004; break;
    case "seesaw": pose.rotate = wave * a * 0.4; pose.y = -Math.abs(wave) * a * 0.4; break;
    case "boomerang": pose.x = wave * a; pose.rotate = -wave * a * 0.5; break;
    case "figure-eight": pose.x = wave * a; pose.y = Math.sin(angle * 2) * a; break;
    case "heartbeat": pose.sx = pose.sy = 1 + Math.pow(Math.max(0, Math.sin(angle * 2)), 4) * a * 0.004; break;
    case "leaf": pose.x = wave * a; pose.y = (1 - Math.cos(angle)) * a * 0.4; pose.rotate = wave * a * 0.5; break;
    case "pendulum": pose.rotate = wave * a * 0.5; break;
    case "rubberband": pose.sx = 1 + Math.sin(angle * 2) * a * 0.004; pose.sy = 1 - Math.sin(angle * 2) * a * 0.004; break;
    case "shake": pose.x = Math.sin(angle * 4) * a * 0.5; break;
    case "skipping": pose.x = wave * a; pose.y = -Math.abs(Math.sin(angle * 2)) * a; break;
    case "spiral": pose.x = Math.sin(angle * 2) * Math.abs(wave) * a; pose.y = Math.cos(angle * 2) * Math.abs(wave) * a; break;
    case "swing": pose.x = wave * a * 0.7; pose.rotate = -wave * a * 0.4; break;
    case "tiptoe": pose.y = -Math.max(0, Math.sin(angle * 2)) * a * 0.4; pose.rotate = wave * a * 0.3; break;
    case "wave": pose.y = -Math.sin(angle * 2) * a * 0.5; pose.rotate = wave * a * 0.4; break;
    case "zigzag": pose.x = Math.asin(wave) / (Math.PI / 2) * a; pose.y = -Math.abs(Math.sin(angle * 2)) * a * 0.6; break;
    case "dance": pose.x = wave * a * 0.7; pose.y = -Math.abs(Math.sin(angle * 2)) * a; pose.rotate = Math.sin(angle * 2) * a * 0.5; break;
    case "butterfly": pose.x = wave * a; pose.y = Math.sin(angle * 2) * a * 0.7; pose.rotate = Math.sin(angle * 3) * a * 0.5; pose.sx = 1 - Math.abs(Math.sin(angle * 4)) * a * 0.004; break;
    case "flutter": pose.rotate = Math.sin(angle * 4) * a * 0.5; pose.sx = 1 - Math.abs(Math.sin(angle * 4)) * a * 0.004; break;
    case "shuffle": pose.x = Math.sin(angle * 2) * a; pose.y = -Math.abs(wave) * a * 0.5; pose.rotate = wave * a * 0.4; break;
    case "orbit": pose.x = wave * a * 0.6; pose.y = (1 - Math.cos(angle)) * a * -0.3; break;
  }
  return pose;
}
/** Combine effects in one transform so they never overwrite each other. */
export function loopPose(value: LoopMotion, elapsedMs: number, index = 0) {
  const motion = normalizeLoop(value);
  const finiteTime = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const reverse = motion.direction === "reverse" || (motion.direction === "alternate" && index % 2 === 1);
  // Hold moves along the first quarter of the path, then keeps that pose.
  // Repeating effects traverse the whole seamless cycle indefinitely.
  const travelTime = motion.playback === "hold" ? Math.min(finiteTime / motion.durationMs, 1) * motion.durationMs / 4 : finiteTime;
  const time = reverse ? (motion.durationMs - travelTime % motion.durationMs) % motion.durationMs : travelTime;
  const primary = singlePose(motion, time);
  if (motion.style === "none" || !motion.secondary || motion.secondary === "none") return primary;
  const secondary = singlePose({ ...motion, style: motion.secondary }, time);
  return {
    x: primary.x + secondary.x, y: primary.y + secondary.y,
    rotate: primary.rotate + secondary.rotate,
    sx: primary.sx * secondary.sx, sy: primary.sy * secondary.sy,
  };
}
export function loopOrigin(value: LoopMotion) {
  if (value.style === "pendulum" || (value.style !== "none" && value.secondary === "pendulum")) return "50% 0%";
  return value.style === "rock" || (value.style !== "none" && value.secondary === "rock") ? "50% 100%" : "50% 50%";
}
export function loopTransform(value: LoopMotion, elapsedMs: number, index = 0) {
  const p = loopPose(value, elapsedMs, index);
  return `translate(${p.x}px, ${p.y}px) rotate(${p.rotate}deg) scale(${p.sx}, ${p.sy})`;
}
