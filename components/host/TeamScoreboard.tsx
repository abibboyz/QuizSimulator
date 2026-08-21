"use client";

import { useEffect, useState } from "react";
import { newId } from "@/lib/factory";
import { Button } from "@/components/ui/Button";

export interface Team {
  id: string;
  name: string;
  score: number;
}

interface Props {
  quizId: string;
}

/**
 * Manual scorekeeping for a room. Teams persist per quiz so a session survives
 * an accidental refresh mid-round.
 */
export function TeamScoreboard({ quizId }: Props) {
  const storageKey = `quizsim:teams:${quizId}`;
  const [teams, setTeams] = useState<Team[]>([]);
  const [loaded, setLoaded] = useState(false);

  // localStorage can't be read during render without breaking hydration, so the
  // first paint is empty and the saved teams arrive on mount.
  useEffect(() => {
    let saved: Team[] = [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) saved = JSON.parse(raw) as Team[];
    } catch {
      saved = [];
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setTeams(saved);
    setLoaded(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [storageKey]);

  useEffect(() => {
    if (!loaded) return;
    window.localStorage.setItem(storageKey, JSON.stringify(teams));
  }, [teams, storageKey, loaded]);

  const update = (id: string, patch: Partial<Team>) =>
    setTeams((current) => current.map((team) => (team.id === id ? { ...team, ...patch } : team)));

  const ranked = [...teams].sort((a, b) => b.score - a.score);
  const leader = ranked[0]?.score ?? 0;

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-widest text-ink-400">Teams</h2>
        {teams.length > 0 && (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Reset every team's score to zero?")) {
                setTeams((current) => current.map((team) => ({ ...team, score: 0 })));
              }
            }}
            className="focus-ring rounded-lg px-2 py-1 text-xs text-ink-400 hover:bg-ink-800 hover:text-ink-200"
          >
            Reset scores
          </button>
        )}
      </div>

      <ul className="flex-1 space-y-2 overflow-y-auto">
        {ranked.map((team, index) => (
          <li
            key={team.id}
            className={`rounded-xl border p-2 transition ${
              index === 0 && team.score > 0 && team.score === leader
                ? "border-[var(--accent-line)] bg-[var(--accent-soft)]"
                : "border-ink-700 bg-ink-900/50"
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="w-5 shrink-0 text-center text-xs font-bold text-ink-500">{index + 1}</span>
              <input
                value={team.name}
                onChange={(event) => update(team.id, { name: event.target.value })}
                className="focus-ring min-w-0 flex-1 rounded-md bg-transparent px-1 py-0.5 text-sm font-semibold text-ink-100 hover:bg-ink-800"
                aria-label={`Team ${index + 1} name`}
              />
              <button
                type="button"
                onClick={() => setTeams((current) => current.filter((t) => t.id !== team.id))}
                className="focus-ring rounded px-1 text-xs text-ink-600 hover:text-bad"
                aria-label={`Remove ${team.name}`}
              >
                ✕
              </button>
            </div>

            <div className="mt-1.5 flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => update(team.id, { score: team.score - 1 })}
                className="focus-ring h-8 w-8 rounded-lg border border-ink-600 text-lg font-bold text-ink-300 hover:bg-ink-800"
                aria-label={`Subtract a point from ${team.name}`}
              >
                −
              </button>
              <input
                type="number"
                value={team.score}
                onChange={(event) => update(team.id, { score: Number(event.target.value) || 0 })}
                className="focus-ring w-full min-w-0 rounded-lg border border-ink-700 bg-ink-950 px-2 py-1 text-center text-lg font-bold tabular-nums text-ink-100"
                aria-label={`${team.name} score`}
              />
              <button
                type="button"
                onClick={() => update(team.id, { score: team.score + 1 })}
                className="focus-ring h-8 w-8 rounded-lg border border-ink-600 text-lg font-bold text-ink-300 hover:bg-ink-800"
                aria-label={`Add a point to ${team.name}`}
              >
                +
              </button>
            </div>
          </li>
        ))}
      </ul>

      <Button
        variant="outline"
        size="sm"
        onClick={() =>
          setTeams((current) => [...current, { id: newId(), name: `Team ${current.length + 1}`, score: 0 }])
        }
      >
        + Add team
      </Button>
    </div>
  );
}
