"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker. Production only — in development a
 * cached shell would keep serving stale code between edits.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is an enhancement; the app works fine without it.
      });
    };

    // Registering after load keeps the worker off the critical path for the
    // very first visit.
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });

    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
