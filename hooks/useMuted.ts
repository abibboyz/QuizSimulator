"use client";

import { useSyncExternalStore } from "react";
import { isMuted, subscribeMuted } from "@/lib/sound";

function getServerSnapshot() {
  // Prerender assumes sound is on; the client corrects on hydration once
  // initSound() has read localStorage.
  return false;
}

/**
 * Tracks the device-wide mute flag from `lib/sound`, which lives in module
 * state rather than a store because it has to stay a singleton alongside the
 * AudioContext. Without this subscription a mute button would flip the flag but
 * never re-render its own icon.
 */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, isMuted, getServerSnapshot);
}
