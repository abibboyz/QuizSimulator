"use client";

import type { DragHandleKind, GameSettings, GameSpeed, Question } from "@/types/quiz";
import { Field, Input, Select, Toggle } from "@/components/ui/Field";
import { MediaDropZone } from "@/components/builder/MediaDropZone";
import { DEFAULT_CARD_BACK, DEFAULT_DRAG_ITEM, GAME_KIND_HINTS, GAME_LIMITS, isGameKind, resolveGame } from "@/lib/gameTypes";

const HANDLES: { id: DragHandleKind; label: string; src?: string }[] = [
  { id: "stick", label: "Stick", src: "/drag-handles/stick.svg" },
  { id: "hand", label: "Hand", src: "/drag-handles/hand.svg" },
  { id: "custom", label: "Custom image" },
];

const RULES: Record<string, string> = {
  "memory-flip": "Flip: every card is shown, then they turn face down and the player picks the right card. Recall: only the items to remember are shown, then every answer appears (in a new order) and the player picks the ones they saw. Tick the correct answers.",
  "pop-match": "Answers pop up one after another at random places (or fly in from the edges) and stay for a moment. The player taps the correct ones. Tick every correct answer; with more than one, Submit locks them in.",
  "star-collect": "A correct answer puts stars in the pot (x2, x3 … for each Go in a row). Then the player chooses Star (bank the pot) or Go (keep it and go for more). A wrong answer or no answer loses the pot; leftover stars are banked at the end. Points and streaks work as usual.",
  "drag-match": "The player drags the item (below the answers) onto the answer it matches. Tapping an answer also works. Tick the one correct answer.",
  sequence: "List the answers in the correct order. Players see them shuffled and tap them in order; every answer has to be in its right place.",
  "timed-reveal": "Answers appear one at a time. The player can answer as soon as the right one is up. Tick the correct answers.",
};

/** Settings of the game question types: one panel in the same style as the other question settings. */
export function GameSettingsPanel({ question, onChange }: { question: Question; onChange: (question: Question) => void }) {
  if (!isGameKind(question.kind)) return null;
  const kind = question.kind;
  const g = resolveGame(question);
  const patch = (next: Partial<GameSettings>) => onChange({ ...question, game: { ...question.game, ...next } });
  const seconds = (ms: number) => Math.round(ms / 100) / 10;
  const handle = g.dragHandle.kind;
  const storedHandle = question.game?.dragHandle;

  return (
    <section className="space-y-3 rounded-2xl border border-ink-700 p-3" aria-label="Game settings" data-game-settings={kind}>
      <div>
        <h3 className="text-sm font-semibold">Game settings</h3>
        <p className="mt-0.5 text-xs text-ink-500">{RULES[kind]}</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Toggle checked={g.animate} onChange={(animate) => patch({ animate })} label="Animations" hint="Off = changes happen instantly" />
        <Field label="Speed">
          <Select value={g.speed} onChange={(event) => patch({ speed: event.target.value as GameSpeed })} aria-label="Animation speed">
            <option value="slow">Slow</option>
            <option value="normal">Normal</option>
            <option value="fast">Fast</option>
          </Select>
        </Field>
      </div>

      {kind === "memory-flip" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Style">
            <Select value={g.memoryMode} onChange={(event) => patch({ memoryMode: event.target.value as "flip" | "recall" })} aria-label="Memory style">
              <option value="flip">Flip the cards face down</option>
              <option value="recall">Recall the items</option>
            </Select>
          </Field>
          <Field label="Remember time (s)" hint="The timer includes it">
            <Input type="number" min={GAME_LIMITS.rememberMs.min / 1000} max={GAME_LIMITS.rememberMs.max / 1000} step={0.5} value={seconds(g.rememberMs)}
              onChange={(event) => patch({ rememberMs: Math.round(Number(event.target.value) * 1000) })} />
          </Field>
          {g.memoryMode === "flip" && (
            <Field label="Card back" hint="Any character or emoji">
              <Input value={question.game?.cardBack ?? ""} placeholder={DEFAULT_CARD_BACK} maxLength={4} onChange={(event) => patch({ cardBack: event.target.value || undefined })} />
            </Field>
          )}
        </div>
      )}

      {kind === "pop-match" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Pop from">
            <Select value={g.popFrom} onChange={(event) => patch({ popFrom: event.target.value as "random" | "edges" | "mixed" })} aria-label="Where items pop from">
              <option value="random">Random places</option>
              <option value="edges">Fly in from the edges</option>
              <option value="mixed">Both</option>
            </Select>
          </Field>
          <Field label="Items at once" hint={`1 to ${Math.min(GAME_LIMITS.popCount.max, Math.max(1, question.options.length))}`}>
            <Input type="number" min={1} max={Math.min(GAME_LIMITS.popCount.max, Math.max(1, question.options.length))} step={1} value={g.popCount}
              onChange={(event) => patch({ popCount: Math.round(Number(event.target.value)) })} />
          </Field>
          <Field label="Stays up (s)">
            <Input type="number" min={GAME_LIMITS.popMs.min / 1000} max={GAME_LIMITS.popMs.max / 1000} step={0.2} value={seconds(g.popMs)}
              onChange={(event) => patch({ popMs: Math.round(Number(event.target.value) * 1000) })} />
          </Field>
        </div>
      )}

      {kind === "star-collect" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stars per correct answer">
            <Input type="number" min={GAME_LIMITS.stars.min} max={GAME_LIMITS.stars.max} step={1} value={g.stars}
              onChange={(event) => patch({ stars: Math.round(Number(event.target.value)) })} />
          </Field>
          <Field label="Preview / video picks" hint="What the simulated player does">
            <Select value={g.videoChoice} onChange={(event) => patch({ videoChoice: event.target.value as "star" | "go" })} aria-label="Simulated choice">
              <option value="star">Star (bank)</option>
              <option value="go">Go (carry on)</option>
            </Select>
          </Field>
        </div>
      )}

      {kind === "timed-reveal" && (
        <Field label="Seconds between answers">
          <Input type="number" min={GAME_LIMITS.stepMs.min / 1000} max={GAME_LIMITS.stepMs.max / 1000} step={0.2} value={seconds(g.stepMs)}
            onChange={(event) => patch({ stepMs: Math.round(Number(event.target.value) * 1000) })} />
        </Field>
      )}

      {kind === "drag-match" && (
        <div className="space-y-3">
          <Field label="Item to drag" hint="A word or emoji. The question picture is used instead if there is one.">
            <Input value={question.game?.dragItem ?? ""} placeholder={DEFAULT_DRAG_ITEM} maxLength={24} onChange={(event) => patch({ dragItem: event.target.value || undefined })} />
          </Field>
          <div>
            <span className="mb-1.5 block text-xs font-semibold uppercase tracking-widest text-ink-400">Drag handle</span>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Drag handle">
              {HANDLES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={handle === option.id || (option.id === "custom" && storedHandle?.kind === "custom" && !storedHandle.image)}
                  onClick={() => patch({ dragHandle: { kind: option.id, ...(storedHandle?.image ? { image: storedHandle.image } : {}) } })}
                  className={`focus-ring flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-xs font-semibold transition ${
                    (storedHandle?.kind ?? "stick") === option.id ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-ink-700 hover:border-ink-600"
                  }`}
                >
                  {option.src ? (
                    // eslint-disable-next-line @next/next/no-img-element -- a 40px preview of a shipped SVG
                    <img src={option.src} alt="" width={40} height={40} className="h-10 w-10" />
                  ) : (
                    <span className="grid h-10 w-10 place-items-center rounded-lg border border-dashed border-ink-600 text-lg" aria-hidden>🖼️</span>
                  )}
                  {option.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-ink-500">The handle follows the pointer and animates while dragging. Stick is the default.</p>
          </div>
          {(storedHandle?.kind ?? "stick") === "custom" && (
            <div className="space-y-1">
              <MediaDropZone
                label="Handle image (transparent PNG or animated GIF)"
                media={storedHandle?.image}
                onChange={(image) => patch({ dragHandle: { kind: "custom", ...(image ? { image } : {}) } })}
              />
              <p className="text-xs text-ink-500">Upload or replace any time. A GIF keeps animating (in the builder, preview, play, host and the exported video). The middle of the picture is the pointer tip. Without an image the Stick is used.</p>
            </div>
          )}
        </div>
      )}
      <p className="text-[11px] text-ink-500">Shown in the preview as: {GAME_KIND_HINTS[kind]}.</p>
    </section>
  );
}
