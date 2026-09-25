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
import type { Question } from "@/types/quiz";
import { MediaImage } from "@/components/ui/MediaImage";

interface Props {
  questions: Question[];
  activeId: string | null;
  invalidIds: Set<string>;
  onSelect: (id: string) => void;
  onReorder: (questions: Question[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

const KIND_LABEL: Record<Question["kind"], string> = {
  "multiple-choice": "Choice",
  "true-false": "True/False",
  "multi-select": "Multi",
  "image-choice": "Image",
  reveal: "Reveal",
};

export function QuestionList({ questions, activeId, invalidIds, onSelect, onReorder, onDuplicate, onDelete }: Props) {
  const sensors = useSensors(
    // A small distance threshold keeps a click on the row from starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = questions.findIndex((q) => q.id === active.id);
    const to = questions.findIndex((q) => q.id === over.id);
    if (from === -1 || to === -1) return;
    onReorder(arrayMove(questions, from, to));
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      modifiers={[restrictToVerticalAxis, restrictToParentElement]}
    >
      <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
        <ul className="space-y-2">
          {questions.map((question, index) => (
            <QuestionRow
              key={question.id}
              question={question}
              index={index}
              active={question.id === activeId}
              invalid={invalidIds.has(question.id)}
              canDelete={questions.length > 1}
              canMoveUp={index > 0}
              canMoveDown={index < questions.length - 1}
              onSelect={() => onSelect(question.id)}
              onMove={(direction) => onReorder(arrayMove(questions, index, index + direction))}
              onDuplicate={() => onDuplicate(question.id)}
              onDelete={() => onDelete(question.id)}
            />
          ))}
        </ul>
      </SortableContext>
    </DndContext>
  );
}

interface RowProps {
  question: Question;
  index: number;
  active: boolean;
  invalid: boolean;
  canDelete: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onSelect: () => void;
  /** -1 moves the question up, +1 moves it down. */
  onMove: (direction: -1 | 1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
}

function QuestionRow({
  question,
  index,
  active,
  invalid,
  canDelete,
  canMoveUp,
  canMoveDown,
  onSelect,
  onMove,
  onDuplicate,
  onDelete,
}: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: question.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-2 rounded-xl border p-2 transition ${
        active ? "border-[var(--accent-line)] bg-[var(--accent-soft)]" : "border-ink-700 bg-ink-900/40 hover:border-ink-600"
      } ${isDragging ? "z-10 opacity-95 shadow-2xl" : ""}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="focus-ring cursor-grab touch-none px-1 text-ink-500 hover:text-ink-300 active:cursor-grabbing"
        aria-label={`Reorder question ${index + 1}`}
      >
        ⠿
      </button>

      <button type="button" onClick={onSelect} className="focus-ring flex min-w-0 flex-1 items-center gap-2 text-left">
        <span className="w-5 shrink-0 text-xs font-bold tabular-nums text-ink-500">{index + 1}</span>

        {question.media && (
          <MediaImage media={question.media} className="h-8 w-8 shrink-0 rounded-md object-cover" />
        )}

        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink-100">
            {question.prompt || <span className="text-ink-500">Untitled question</span>}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-500">
            {KIND_LABEL[question.kind]}
            {invalid && <span className="text-amber-400">· needs attention</span>}
          </span>
        </span>
      </button>

      {/*
        Drag is the fast path, but arrow buttons keep reordering possible on
        touch screens and for anyone driving the builder from the keyboard.
      */}
      <div className="flex shrink-0 gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
        <div className="flex flex-col">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            className="focus-ring rounded-md px-1 text-[9px] leading-none text-ink-400 hover:bg-ink-800 hover:text-ink-200 disabled:opacity-25"
            aria-label={`Move question ${index + 1} up`}
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            className="focus-ring rounded-md px-1 text-[9px] leading-none text-ink-400 hover:bg-ink-800 hover:text-ink-200 disabled:opacity-25"
            aria-label={`Move question ${index + 1} down`}
          >
            ▼
          </button>
        </div>
        <button
          type="button"
          onClick={onDuplicate}
          className="focus-ring rounded-md px-1.5 py-1 text-xs text-ink-400 hover:bg-ink-800 hover:text-ink-200"
          aria-label={`Duplicate question ${index + 1}`}
        >
          ⧉
        </button>
        <button
          type="button"
          onClick={onDelete}
          disabled={!canDelete}
          className="focus-ring rounded-md px-1.5 py-1 text-xs text-ink-400 hover:bg-ink-800 hover:text-bad disabled:opacity-25"
          aria-label={`Delete question ${index + 1}`}
        >
          ✕
        </button>
      </div>
    </li>
  );
}
