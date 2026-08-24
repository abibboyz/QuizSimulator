"use client";

import type { MediaRef } from "@/types/quiz";
import { mascotOf } from "@/lib/progress";
import { MediaImage } from "@/components/ui/MediaImage";

interface Props {
  character?: string;
  media?: MediaRef;
  /** Celebrating rather than travelling. */
  dancing?: boolean;
  /** Rendered size in pixels. */
  size: number;
}

/**
 * The walking character, shared by the question timer and the quiz-wide meter
 * so a quiz only ever has one mascot to configure.
 */
export function MascotFigure({ character, media, dancing = false, size }: Props) {
  return (
    <span
      className={`grid h-full w-full place-items-center ${dancing ? "animate-mascot-dance" : "animate-mascot-walk"}`}
    >
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
