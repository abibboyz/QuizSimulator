"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function getSnapshot() {
  return window.matchMedia(QUERY).matches;
}

function getServerSnapshot() {
  // Prerender assumes motion is fine; the client corrects on hydration.
  return false;
}

/**
 * Tracks `prefers-reduced-motion` live, so toggling it in the OS takes effect
 * without a reload. Canvas animations read this to skip their rAF loop
 * entirely rather than just running faster.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
