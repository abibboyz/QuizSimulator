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
import { readableTextOn } from "@/lib/themes";
import { optionColor, optionMarker, themeAgeBand } from "@/lib/ageBands";
import { ColorSwatch } from "@/components/ui/ColorSwatch";
import { Input } from "@/components/ui/Field";
import { ImageAnswerGrid } from "@/components/builder/ImageAnswerGrid";
import { MediaDropZone } from "@/components/builder/MediaDropZone";

const MAX_OPTIONS = 6;

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
  const multi = question.kind === "multi-select";

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

  const remove = (id: string) => {
    if (question.options.length <= 2) return;
    onChange({ ...question, options: question.options.filter((o) => o.id !== id) });
  };

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
      canRemove={!fixed && question.options.length > 2}
      onText={(text) => update(option.id, { text })}
      onIcon={(icon) => update(option.id, { icon: icon.trim() ? icon : undefined })}
      onColor={(color) => update(option.id, { color })}
      onMedia={(media) => update(option.id, { media })}
      onMarkCorrect={() => markCorrect(option.id)}
      onRemove={() => remove(option.id)}
    />
  ));

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-400">
          Answers {multi && <span className="text-ink-500">· mark every correct one</span>}
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
  onText: (text: string) => void;
  onIcon: (icon: string) => void;
  onColor: (color: string | undefined) => void;
  onMedia: (media?: Option["media"]) => void;
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
  onText,
  onIcon,
  onColor,
  onMedia,
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
      />

      <button
        type="button"
        role={multi ? "checkbox" : "radio"}
        aria-checked={option.correct}
        onClick={onMarkCorrect}
        title={option.correct ? "Correct answer" : "Mark as correct"}
        className={`focus-ring grid h-7 w-7 shrink-0 place-items-center text-sm font-bold transition ${
          multi ? "rounded-md" : "rounded-full"
        } ${option.correct ? "bg-good text-ink-950" : "border border-ink-600 text-transparent hover:border-good/60"}`}
      >
        ✓
      </button>

      <Input
        value={option.text}
        onChange={(event) => onText(event.target.value)}
        placeholder={`Answer ${index + 1}`}
        className="flex-1"
      />

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
    </div>
  );
}
