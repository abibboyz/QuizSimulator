"use client";

import type { MascotMotion, MediaRef } from "@/types/quiz";
import { mascotOf } from "@/lib/progress";
import { MediaImage } from "@/components/ui/MediaImage";

interface Props {
  character?: string;
  media?: MediaRef;
  /** Celebrating rather than travelling. */
  dancing?: boolean;
  motion?: MascotMotion;
  /** Rendered size in pixels. */
  size: number;
}

/**
 * The walking character, shared by the question timer and the quiz-wide meter
 * so a quiz only ever has one mascot to configure.
 */
export function MascotFigure({ character, media, dancing = false, motion = "walk", size }: Props) {
  const motionClass = dancing ? "animate-mascot-dance" : motion === "still" ? "" : `animate-mascot-${motion}`;
  return (
    <span className={`grid h-full w-full place-items-center ${motionClass}`}>
      <MediaImage
        media={media}
        className="h-full w-full object-contain"
        fallback={
          /*
           * Side-view emoji creatures all face left, so unmirrored they moonwalk
           * to the finish. `display: block` because transforms don't apply to a
           * plain inline element. An uploaded picture is deliberately left alone
           * — that one is the author's own artwork, pointed wherever they meant.
           */
          <span style={{ fontSize: size, lineHeight: 1, display: "block", transform: "scaleX(-1)" }}>
            {mascotOf(character)}
          </span>
        }
      />
    </span>
  );
}
