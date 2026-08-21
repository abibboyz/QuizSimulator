"use client";

import { useAnimatedNumber } from "@/hooks/useAnimatedNumber";

interface Props {
  score: number;
  streak: number;
  compact?: boolean;
}

export function ScoreBadge({ score, streak, compact = false }: Props) {
  const shown = useAnimatedNumber(score);

  return (
    <div className="flex items-center gap-3">
      {streak >= 2 && (
        <span
          key={streak}
          className="animate-streak rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-sm font-bold text-amber-300"
          title={`${streak} correct in a row`}
        >
          🔥 {streak}
        </span>
      )}
      <div className="text-right">
        <div className={`font-bold tabular-nums text-ink-100 ${compact ? "text-xl" : "text-3xl"}`}>
          {shown.toLocaleString()}
        </div>
        {!compact && <div className="text-[10px] uppercase tracking-widest text-ink-400">points</div>}
      </div>
    </div>
  );
}
