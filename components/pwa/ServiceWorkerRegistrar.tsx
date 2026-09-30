"use client";

import { useEffect } from "react";

/**
 * Registers the offline service worker. Production only — in development a
 * cached shell would keep serving stale code between edits.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV !== "production") {
      // A worker installed by a previous production run can still control the
      // dev origin and serve stale, non-hashed Turbopack modules.
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        const ours = (url: string | undefined) => !!url && new URL(url).origin === location.origin && new URL(url).pathname === "/sw.js";
        const controlled = ours(navigator.serviceWorker.controller?.scriptURL);
        const ownRegistrations = registrations.filter((registration) =>
          ours(registration.active?.scriptURL) || ours(registration.waiting?.scriptURL) || ours(registration.installing?.scriptURL));
        await Promise.all(ownRegistrations.map((registration) => registration.unregister()));
        if (ownRegistrations.length && "caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.filter((name) => name.startsWith("quizsim-shell-") || name.startsWith("quizsim-runtime-")).map((name) => caches.delete(name)));
        }
        if (controlled && ownRegistrations.length) location.reload();
      }).catch(() => { /* Dev still works when worker inspection is unavailable. */ });
      return;
    }

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
