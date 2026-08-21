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
import type { Option, Question } from "@/types/quiz";
import { createOption } from "@/lib/factory";
import { optionStyle } from "@/lib/themes";
import { Input } from "@/components/ui/Field";
import { MediaDropZone } from "@/components/builder/MediaDropZone";

const MAX_OPTIONS = 6;

interface Props {
  question: Question;
  onChange: (question: Question) => void;
}

export function OptionList({ question, onChange }: Props) {
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
      sortable={!fixed}
      canRemove={!fixed && question.options.length > 2}
      onText={(text) => update(option.id, { text })}
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
        {!fixed && question.options.length < MAX_OPTIONS && (
          <button
            type="button"
            onClick={() => onChange({ ...question, options: [...question.options, createOption()] })}
            className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800"
          >
            + Add answer
          </button>
        )}
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
  sortable: boolean;
  canRemove: boolean;
  onText: (text: string) => void;
  onMedia: (media?: Option["media"]) => void;
  onMarkCorrect: () => void;
  onRemove: () => void;
}

function OptionRow({ option, index, multi, sortable, canRemove, onText, onMedia, onMarkCorrect, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: option.id,
    disabled: !sortable,
  });

  const style = optionStyle(index);

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

      <span
        aria-hidden
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm text-white"
        style={{ background: style.bg }}
      >
        {style.shape}
      </span>

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
