/**
 * The optional correct-answer card. Pure, so play, the video, and tests share
 * one decision about what the card shows.
 *
 * A question with no celebration, or with it switched off, resolves to nothing
 * and the reveal stays as it is.
 */

import type { CelebrationAnimation, MediaRef, Option, Question } from "@/types/quiz";
import { ANIMATIONS } from "./animations.ts";
import { POP_IN } from "./playTiming.ts";
import { resolveReveal, revealAnswerMedia } from "./reveal.ts";

export const CELEBRATION_ANIMATIONS: { id: CelebrationAnimation; label: string }[] = [
  { id: "confetti", label: "Smooth pop" },
  { id: "shooting-star", label: "Shooting-star landing" },
  { id: "bubbles", label: "Bubble assemble" },
  { id: "butterfly", label: "Butterfly assemble" },
  { id: "stars", label: "Star assemble" },
  { id: "glass-assemble", label: "Glass assemble" },
  { id: "mosaic-assemble", label: "Mosaic assemble" },
  { id: "spiral-assemble", label: "Spiral assemble" },
  { id: "curtain-assemble", label: "Curtain strips" },
  { id: "flip-assemble", label: "Flip tiles" },
  { id: "zoom-assemble", label: "Zoom fragments" },
  { id: "none", label: "Smooth fade" },
];

/** The card pops in, then the chosen animation starts. */
export const CELEBRATION_FOLLOW_MS = POP_IN.durationMs;

const ANIMATION_IDS = new Set<string>(CELEBRATION_ANIMATIONS.map((item) => item.id));

export function celebrationEnabled(question: Pick<Question, "celebration"> | undefined): boolean {
  return question?.celebration?.enabled === true;
}

/** Text-only celebrations retain their card so the answer stays readable. */
export function hidesCelebrationBox(
  question: Pick<Question, "celebration"> | undefined,
  settings?: { hideImageBoxes?: boolean },
): boolean {
  return celebrationEnabled(question) && (settings?.hideImageBoxes === true || question?.celebration?.hideBox === true);
}

export function animatesCelebrationFromAnswer(question: Pick<Question, "celebration"> | undefined): boolean {
  return celebrationEnabled(question) &&
    (question?.celebration?.animateFromAnswer === true || question?.celebration?.animateFromReveal === true);
}

/** Reveal questions finish uncovering before their optional card appears. */
export function celebrationDelayMs(question: Question): number {
  return celebrationEnabled(question) && question.kind === "reveal" ? resolveReveal(question).durationMs : 0;
}

/** Unset or unknown falls back to confetti, including while the switch is off. */
export function celebrationAnimation(question: Pick<Question, "celebration">): CelebrationAnimation {
  const raw = question.celebration?.animation;
  return raw && ANIMATION_IDS.has(raw) ? raw : "confetti";
}

/** How long the follow-on motion runs. Confetti is drawn by its own physics. */
export function celebrationMotionMs(animation: CelebrationAnimation, durationMs?: number): number {
  if (animation === "none") return 0;
  if (Number.isFinite(durationMs)) return Math.min(4000, Math.max(1000, Math.round(durationMs!)));
  return ANIMATIONS[animation].defaultMs;
}

export interface CelebrationImage {
  media: MediaRef;
}

export interface CelebrationView {
  images: CelebrationImage[];
  /**
   * Words drawn on the card. Only the right answer's own words, and only when
   * the card has no picture. Empty when the answer has no text.
   */
  lines: string[];
  /** The correct answer's own words. A picture card does not draw them. */
  text: string;
}

function usable(media: MediaRef | undefined): media is MediaRef {
  if (!media) return false;
  if (media.kind === "stored") return typeof media.id === "string" && media.id.length > 0;
  if (media.kind === "url") return typeof media.url === "string" && media.url.length > 0;
  return false;
}

function answerPicture(question: Question, option: Option): MediaRef | undefined {
  // A choice question's own picture is the prompt, not the answer. Only Reveal
  // keeps a legacy answer picture on the question.
  const media = question.kind === "reveal" ? revealAnswerMedia(question, option) : option.media;
  return usable(media) ? media : undefined;
}

/** What the card draws, or null when this question isn't celebrating. */
export function celebrationView(question: Question): CelebrationView | null {
  if (!celebrationEnabled(question)) return null;

  const correct = question.options.filter((option) => option.correct);
  const names = correct.map((option) => option.text.trim()).filter(Boolean);
  const spoken = names.join(", ");
  const uploaded = question.celebration?.image;

  // The checkbox always gives the correct answer's own picture priority over
  // an uploaded card picture, whatever kind of question supplied that answer.
  if (question.celebration?.useAnswerImage === true) {
    const images = correct.flatMap((option) => {
      const media = answerPicture(question, option);
      return media ? [{ media }] : [];
    });
    if (images.length) return { images, lines: [], text: spoken };
  }

  // A picture is the whole card. Words appear only when there is no picture,
  // and then only the right answer's own words — never a label.
  if (usable(uploaded)) return { images: [{ media: uploaded }], lines: [], text: spoken };

  if (question.kind === "image-choice") {
    const images: CelebrationImage[] = [];
    for (const option of correct) {
      const media = answerPicture(question, option);
      if (media) images.push({ media });
    }
    // A picture card is only the picture. The answer's words stay on the tiles.
    if (images.length) return { images, lines: [], text: spoken };
  }

  return { images: [], lines: names, text: spoken };
}
