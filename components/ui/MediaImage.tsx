"use client";

import type { MediaRef } from "@/types/quiz";
import { useMediaUrl } from "@/hooks/useMediaUrl";

interface Props {
  media?: MediaRef;
  className?: string;
  /** Rendered while the blob is still coming out of IndexedDB. */
  fallback?: React.ReactNode;
}

/**
 * Plain <img> rather than next/image: sources are blob: URLs created at runtime,
 * which the image optimizer can't fetch or resize.
 */
export function MediaImage({ media, className = "", fallback = null }: Props) {
  const url = useMediaUrl(media);

  if (!media) return <>{fallback}</>;
  if (!url) {
    return <div className={`animate-pulse rounded-xl bg-ink-800 ${className}`} aria-hidden />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={media.alt ?? ""} className={className} draggable={false} />
  );
}
