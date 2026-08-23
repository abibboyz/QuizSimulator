import Link from "next/link";

export const metadata = {
  title: "Offline · Quiz Simulator",
};

/**
 * Shown when a page is requested that was never cached and the network is
 * gone. Quizzes themselves live in IndexedDB, so the dashboard still works.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="grid grid-cols-2 gap-1.5" aria-hidden>
        {["#e11d48", "#2563eb", "#f59e0b", "#16a34a"].map((color) => (
          <span key={color} className="h-7 w-7 rounded-lg opacity-60" style={{ background: color }} />
        ))}
      </div>

      <div>
        <h1 className="text-2xl font-bold text-ink-100">You&apos;re offline</h1>
        <p className="mx-auto mt-2 max-w-sm text-ink-400">
          This page hasn&apos;t been saved for offline use yet. Your quizzes are stored on this device, so the
          dashboard still works.
        </p>
      </div>

      <Link
        href="/"
        className="focus-ring rounded-xl px-5 py-2.5 font-semibold text-ink-950"
        style={{ background: "var(--accent)" }}
      >
        Back to your quizzes
      </Link>
    </div>
  );
}
