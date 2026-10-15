"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ReactNode } from "react";
import type { AgeBand, Option, OptionMarker, Question, Theme } from "@/types/quiz";
import { createOption } from "@/lib/factory";
import { isSingleAnswer } from "@/lib/answerPresentation";
import { isGameKind } from "@/lib/gameTypes";
import { readableTextOn } from "@/lib/themes";
import { answerColorPresets, optionColor, optionMarker, themeAgeBand } from "@/lib/ageBands";
import { ColorSwatch } from "@/components/ui/ColorSwatch";
import { Input } from "@/components/ui/Field";
import { ImageAnswerGrid } from "@/components/builder/ImageAnswerGrid";
import { MediaDropZone } from "@/components/builder/MediaDropZone";

const MAX_OPTIONS = 50;

interface Props {
  question: Question;
  onChange: (question: Question) => void;
  /** Keeps the builder badges matching the tiles that will actually play. */
  theme: Theme;
  /** Control shown on the "Answers" header row, e.g. the label colour swatch. */
  action?: ReactNode;
}

export function OptionList(props: Props) {
  // A separate component so switching to Image does not change how many hooks
  // the text-answer list calls. Choice, true/false, and multi-select stay here.
  if (props.question.kind === "image-choice" || props.question.kind === "reveal") {
    return <ImageAnswerGrid question={props.question} onChange={props.onChange} action={props.action} />;
  }
  return <TextOptionList {...props} />;
}

function TextOptionList({ question, onChange, theme, action }: Props) {
  const ageBand = themeAgeBand(theme);
  const fixed = question.kind === "true-false";
  // Game types: sequence has no tick (the list order is the answer); the others pick-all like multi-select.
  const game = isGameKind(question.kind);
  const ordered = question.kind === "sequence";
  const multi = question.kind === "multi-select" || (game && !ordered);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const update = (id: string, patch: Partial<Option>) =>
    onChange({ ...question, options: question.options.map((o) => (o.id === id ? { ...o, ...patch } : o)) });

  const markCorrect = (id: string) => {
    if (multi) {
      const target = question.options.find((o) => o.id === id);
      update(id, { correct: !target?.correct });
      return;
    }
    // Single-answer questions: exactly one correct, always.
    onChange({ ...question, options: question.options.map((o) => ({ ...o, correct: o.id === id })) });
  };

  // Down to one answer (never for true/false): a lone answer is a single-answer
  // slide and is always saved correct.
  const remove = (id: string) => {
    if (fixed || question.options.length <= (game ? 2 : 1)) return;
    const options = question.options.filter((o) => o.id !== id);
    onChange({ ...question, options: options.length === 1 ? [{ ...options[0], correct: true }] : options });
  };
  const single = isSingleAnswer(question);

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = question.options.findIndex((o) => o.id === active.id);
    const to = question.options.findIndex((o) => o.id === over.id);
    if (from === -1 || to === -1) return;
    onChange({ ...question, options: arrayMove(question.options, from, to) });
  };

  const rows = question.options.map((option, index) => (
    <OptionRow
      key={option.id}
      option={option}
      index={index}
      multi={multi}
      ageBand={ageBand}
      marker={theme.optionMarker}
      textColor={theme.optionTextColor}
      colors={theme.optionColors}
      sortable={!fixed}
      canRemove={!fixed && question.options.length > (game ? 2 : 1)}
      ordered={ordered}
      locked={single}
      onText={(text) => update(option.id, { text })}
      onIcon={(icon) => update(option.id, { icon: icon.trim() ? icon : undefined })}
      onColor={(color) => update(option.id, { color })}
      onMedia={(media) => update(option.id, { media })}
      onBoxWidth={(boxWidth) => update(option.id, { boxWidth })}
      onHideBox={(hideBox) => update(option.id, { hideBox })}
      onMarkCorrect={() => markCorrect(option.id)}
      onRemove={() => remove(option.id)}
    />
  ));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-400">
          Answers <span className="text-ink-500">· {question.options.length} of {MAX_OPTIONS}</span> {single ? <span className="text-ink-500">· Single answer · always celebrated, not scored</span> : ordered ? <span className="text-ink-500">· list them in the correct order (drag ⠿ to reorder); players see them shuffled</span> : multi && <span className="text-ink-500">· mark every correct one</span>}
        </span>
        <span className="flex items-center gap-1">
          {action}
          {!fixed && question.options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={() => onChange({ ...question, options: [...question.options, createOption()] })}
              className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800"
            >
              + Add answer
            </button>
          )}
        </span>
      </div>

      {fixed ? (
        <div className="space-y-2">{rows}</div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        >
          <SortableContext items={question.options.map((o) => o.id)} strategy={verticalListSortingStrategy}>
            <div className="space-y-2">{rows}</div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

interface RowProps {
  option: Option;
  index: number;
  multi: boolean;
  ageBand?: AgeBand;
  marker?: OptionMarker;
  /** Quiz-wide answer text colour; unset means each badge picks its own. */
  textColor?: string;
  /** Quiz-wide tile colours by slot; unset slots fall back to the palette. */
  colors?: string[];
  sortable: boolean;
  canRemove: boolean;
  /** Single answer: the tick is fixed on. */
  locked?: boolean;
  /** Sequence: show the answer's place in the order instead of a tick. */
  ordered?: boolean;
  onText: (text: string) => void;
  onIcon: (icon: string) => void;
  onColor: (color: string | undefined) => void;
  onMedia: (media?: Option["media"]) => void;
  onBoxWidth: (boxWidth?: number) => void;
  onHideBox: (hideBox?: boolean) => void;
  onMarkCorrect: () => void;
  onRemove: () => void;
}

function OptionRow({
  option,
  index,
  multi,
  ageBand,
  marker,
  textColor,
  colors,
  sortable,
  canRemove,
  locked = false,
  ordered = false,
  onText,
  onIcon,
  onColor,
  onMedia,
  onBoxWidth,
  onHideBox,
  onMarkCorrect,
  onRemove,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled: !sortable,
  });

  const bg = optionColor(index, { band: ageBand, colors, override: option.color });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-2 rounded-xl border bg-ink-900/50 p-2 transition ${
        option.correct ? "border-good/50 bg-good/5" : "border-ink-700"
      } ${isDragging ? "z-10 opacity-90 shadow-xl" : ""}`}
    >
      {sortable && (
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="focus-ring cursor-grab touch-none px-1 text-ink-500 hover:text-ink-300 active:cursor-grabbing"
          aria-label={`Reorder answer ${index + 1}`}
        >
          ⠿
        </button>
      )}

      {/*
        The badge doubles as its own editor: type any character or emoji to give
        this one answer a custom marker, or clear it to fall back to the
        quiz-wide style. Placeholder shows what the fallback currently renders.
      */}
      <input
        value={option.icon ?? ""}
        onChange={(event) => onIcon(event.target.value)}
        placeholder={optionMarker(index, { band: ageBand, marker })}
        aria-label={`Icon for answer ${index + 1}`}
        title="Type any character or emoji. Leave blank to use the quiz-wide marker."
        className="focus-ring h-7 w-9 shrink-0 rounded-lg border-0 text-center text-sm placeholder:text-current placeholder:opacity-70"
        // Same rules AnswerGrid uses, so the badge here matches the tile that plays.
        style={{ background: bg, color: textColor ?? readableTextOn(bg) }}
      />

      <ColorSwatch
        label={`Tile colour for answer ${index + 1}`}
        value={option.color}
        fallback={optionColor(index, { band: ageBand, colors })}
        onChange={onColor}
        compact
        presets={answerColorPresets(ageBand)}
      />

      {ordered ? (
        <span
          aria-label={`Position ${index + 1} in the correct order`}
          title="Position in the correct order"
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-good text-sm font-bold text-ink-950"
        >
          {index + 1}
        </span>
      ) : (
        <button
          type="button"
          role={multi ? "checkbox" : "radio"}
          aria-checked={option.correct}
          onClick={onMarkCorrect}
          disabled={locked}
          title={locked ? "Single answer · always correct" : option.correct ? "Correct answer" : "Mark as correct"}
          className={`focus-ring grid h-7 w-7 shrink-0 place-items-center text-sm font-bold transition ${
            multi ? "rounded-md" : "rounded-full"
          } ${option.correct ? "bg-good text-ink-950" : "border border-ink-600 text-transparent hover:border-good/60"}`}
        >
          ✓
        </button>
      )}

      <Input
        value={option.text}
        onChange={(event) => onText(event.target.value)}
        placeholder={`Answer ${index + 1}`}
        className={`flex-1 transition-all ${option.hideBox ? "border-dashed border-ink-600 bg-transparent" : ""}`}
        style={{
          maxWidth: option.boxWidth ? `${Math.round(option.boxWidth * 100)}%` : undefined,
        }}
      />

      {/* Resizer: controls answer box length / width */}
      <div
        className="flex shrink-0 items-center rounded-lg border border-ink-700/80 bg-ink-950/60 p-0.5 text-xs text-ink-300"
        title="Resize answer box length (width). Click − or + to adjust, or click % to cycle presets (100%, 80%, 60%, 40%)."
      >
        <button
          type="button"
          onClick={() => {
            const current = option.boxWidth ?? 1;
            const next = Math.max(0.35, Math.round((current - 0.1) * 10) / 10);
            onBoxWidth(next >= 0.99 ? undefined : next);
          }}
          disabled={(option.boxWidth ?? 1) <= 0.35}
          className="focus-ring rounded px-1.5 py-0.5 font-bold text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-25"
          title="Make answer box shorter (narrower length: -10%)"
          aria-label={`Make answer ${index + 1} shorter`}
        >
          −
        </button>
        <button
          type="button"
          onClick={() => {
            const current = option.boxWidth ?? 1;
            const next = current <= 0.45 ? undefined : current <= 0.65 ? 0.4 : current <= 0.85 ? 0.6 : 0.8;
            onBoxWidth(next);
          }}
          className="focus-ring px-1.5 py-0.5 text-[11px] font-semibold tabular-nums text-ink-300 hover:text-ink-100"
          title={`Answer box length: ${Math.round((option.boxWidth ?? 1) * 100)}%. Click to cycle presets (100%, 80%, 60%, 40%).`}
          aria-label={`Current answer ${index + 1} length: ${Math.round((option.boxWidth ?? 1) * 100)}%`}
        >
          ↔ {Math.round((option.boxWidth ?? 1) * 100)}%
        </button>
        <button
          type="button"
          onClick={() => {
            const current = option.boxWidth ?? 1;
            const next = Math.min(1, Math.round((current + 0.1) * 10) / 10);
            onBoxWidth(next >= 0.99 ? undefined : next);
          }}
          disabled={(option.boxWidth ?? 1) >= 1}
          className="focus-ring rounded px-1.5 py-0.5 font-bold text-ink-400 hover:bg-ink-800 hover:text-ink-100 disabled:opacity-25"
          title="Make answer box longer (wider length: +10%)"
          aria-label={`Make answer ${index + 1} longer`}
        >
          +
        </button>
      </div>

      <MediaDropZone media={option.media} onChange={onMedia} compact />

      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove}
        className="focus-ring rounded-lg px-2 py-1 text-ink-500 transition hover:text-bad disabled:opacity-25 disabled:hover:text-ink-500"
        aria-label={`Delete answer ${index + 1}`}
      >
        ✕
      </button>

      {/* Hide box background (make box transparent) */}
      <button
        type="button"
        onClick={() => onHideBox(option.hideBox ? undefined : true)}
        className={`focus-ring shrink-0 rounded-lg border p-1.5 transition ${
          option.hideBox
            ? "border-[var(--accent-line,#6366f1)] bg-[var(--accent-soft,rgba(99,102,241,0.15))] text-ink-100 shadow-sm"
            : "border-ink-700 bg-ink-800/40 text-ink-400 hover:border-ink-600 hover:text-ink-200"
        }`}
        aria-label={`Make answer ${index + 1} box transparent`}
        title={
          option.hideBox
            ? "Box background is hidden (transparent). Click to restore solid card background."
            : "Make box transparent (hide box background). Click to make answer card transparent."
        }
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="18" height="18" rx="3" strokeDasharray={option.hideBox ? "3 3" : undefined} />
          {option.hideBox && <line x1="3" y1="21" x2="21" y2="3" strokeWidth={1.5} />}
        </svg>
      </button>
    </div>
  );
}
