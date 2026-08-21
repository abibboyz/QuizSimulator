"use client";

import { useEffect, useState } from "react";
import type { MediaRef } from "@/types/quiz";
import { getMedia } from "@/lib/storage";

/**
 * Resolves a MediaRef to something an <img src> can use, and revokes the object
 * URL on unmount. Leaked object URLs pin their blob in memory for the life of
 * the tab, which adds up fast in a builder full of thumbnails.
 *
 * The resolved URL is stored alongside the id it belongs to, so a ref change is
 * reported as "loading" during render rather than briefly showing the previous
 * image.
 */
export function useMediaUrl(ref?: MediaRef): string | null {
  const storedId = ref?.kind === "stored" ? ref.id : null;
  const [resolved, setResolved] = useState<{ id: string; url: string } | null>(null);

  useEffect(() => {
    if (!storedId) return;

    let objectUrl: string | null = null;
    let cancelled = false;

    void getMedia(storedId).then((record) => {
      if (cancelled || !record) return;
      objectUrl = URL.createObjectURL(record.blob);
      setResolved({ id: storedId, url: objectUrl });
    });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [storedId]);

  if (!ref) return null;
  if (ref.kind === "url") return ref.url;
  return resolved?.id === ref.id ? resolved.url : null;
}
