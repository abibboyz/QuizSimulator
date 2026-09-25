"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import type { Quiz } from "@/types/quiz";
import { getQuiz } from "@/lib/storage";
import { Button } from "@/components/ui/Button";

/**
 * The only piece of the video exporter in the main bundle: a button. The
 * dialog, renderer, encoders and muxers are a separate chunk fetched on first
 * click, so app start-up and the play screen don't pay for them.
 */
const ExportVideoDialog = dynamic(
  () =>
    import("./ExportVideoDialog")
      .then((m) => m.ExportVideoDialog)
      // Offline before the exporter was ever downloaded: say so instead of
      // letting a failed chunk load take the page down.
      .catch(() => ExportUnavailable),
  {
    ssr: false,
    loading: () => (
      <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 backdrop-blur-sm">
        <p className="rounded-xl bg-ink-900 px-4 py-3 text-sm text-ink-300">Loading video export…</p>
      </div>
    ),
  },
);

function ExportUnavailable({ onClose }: { onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-w-sm space-y-3 rounded-2xl border border-ink-700 bg-ink-900 p-5 text-sm text-ink-300">
        <p className="font-semibold text-ink-100">Video export couldn&apos;t load</p>
        <p>
          It downloads the first time you use it. Connect to the internet once and try again — after that it works
          offline too.
        </p>
        <Button variant="outline" size="sm" onClick={onClose}>
          Close
        </Button>
      </div>
    </div>
  );
}

interface Props {
  /** Pass the quiz when it's already in memory (editor, play screen)… */
  quiz?: Quiz;
  /** …or just its id (dashboard cards only have summaries). */
  quizId?: string;
  /** Pre-selects the framing — e.g. vertical when the player picked mobile view. */
  defaultFraming?: "vertical" | "horizontal";
  variant?: "primary" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ExportVideoButton({ quiz, quizId, defaultFraming, variant = "ghost", size = "sm", className }: Props) {
  const [target, setTarget] = useState<Quiz | null>(null);
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (quiz) {
      setTarget(quiz);
      return;
    }
    if (!quizId) return;
    setBusy(true);
    try {
      setTarget(await getQuiz(quizId));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={open}
        disabled={busy}
        title="Render the auto-play run to an MP4/WebM video"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <rect x="3" y="5" width="13" height="14" rx="2" />
          <path d="m16 10 5-3v10l-5-3z" />
        </svg>
        Export video
      </Button>
      {target && <ExportVideoDialog quiz={target} defaultFraming={defaultFraming} onClose={() => setTarget(null)} />}
    </>
  );
}
