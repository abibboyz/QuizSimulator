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
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Option, Question } from "@/types/quiz";
import { createOption } from "@/lib/factory";
import { DEFAULT_IMAGE_GAP, MAX_IMAGE_OPTIONS, imageChoiceGridStyle } from "@/lib/imageChoice";
import { MediaError, imagesFromTransfer, putImage } from "@/lib/media";
import { MediaImage } from "@/components/ui/MediaImage";

interface Props {
  question: Question;
  onChange: (question: Question) => void;
  /** Control shown on the header row, e.g. the answer-text colour swatch. */
  action?: ReactNode;
}

type PickMode = { type: "add" } | { type: "replace"; id: string };

/**
 * The image question's answers, edited as the same refitting grid that plays.
 * Pictures land in empty tiles first, then new tiles are added, up to 100.
 */
export function ImageAnswerGrid({ question, onChange, action }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickMode = useRef<PickMode>({ type: "add" });
  const latest = useRef({ question, onChange });
  const busyRef = useRef(false);

  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState(question.options[0]?.id ?? "");

  const count = question.options.length;
  const gap = question.optionGap ?? DEFAULT_IMAGE_GAP;
  const selected = question.options.find((option) => option.id === selectedId) ?? question.options[0];
  const atCap = count >= MAX_IMAGE_OPTIONS;

  useEffect(() => {
    latest.current = { question, onChange };
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const commit = (options: Option[]) => {
    const withCorrect = options.some((option) => option.correct)
      ? options
      : options.map((option, index) => ({ ...option, correct: index === 0 }));
    const current = latest.current;
    current.onChange({ ...current.question, options: withCorrect });
  };

  const addFiles = async (files: File[]) => {
    const images = files.filter((file) => file.type.startsWith("image/"));
    if (!images.length || busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    setError(null);
    const options = latest.current.question.options.map((option) => ({ ...option }));
    let skipped = 0;
    let failed = 0;

    try {
      for (const file of images) {
        const blank = options.findIndex((option) => !option.media);
        if (blank === -1 && options.length >= MAX_IMAGE_OPTIONS) {
          skipped++;
          continue;
        }
        try {
          const media = await putImage(file);
          if (blank !== -1) options[blank] = { ...options[blank], media };
          else options.push({ ...createOption(), media });
        } catch (e) {
          failed++;
          if (failed === 1) setError(e instanceof MediaError ? e.message : "Couldn't add that image.");
        }
      }
      commit(options);
      if (skipped > 0) {
        setError(`Stopped at ${MAX_IMAGE_OPTIONS} images. ${skipped} ${skipped === 1 ? "was" : "were"} left out.`);
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const replaceOne = async (id: string, file: File) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const media = await putImage(file);
      commit(latest.current.question.options.map((option) => (option.id === id ? { ...option, media } : option)));
    } catch (e) {
      setError(e instanceof MediaError ? e.message : "Couldn't add that image.");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const openPicker = (mode: PickMode) => {
    pickMode.current = mode;
    const input = inputRef.current;
    if (!input) return;
    input.multiple = mode.type === "add";
    input.click();
  };

  const markCorrect = (id: string) => {
    commit(latest.current.question.options.map((option) => ({ ...option, correct: option.id === id })));
  };

  const remove = (id: string) => {
    const options = latest.current.question.options;
    if (options.length <= 2) return;
    commit(options.filter((option) => option.id !== id));
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const options = latest.current.question.options;
    const from = options.findIndex((option) => option.id === active.id);
    const to = options.findIndex((option) => option.id === over.id);
    if (from === -1 || to === -1) return;
    commit(arrayMove(options, from, to));
  };

  const addFilesRef = useRef(addFiles);
  useEffect(() => {
    addFilesRef.current = addFiles;
  });

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
      const files = imagesFromTransfer(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      void addFilesRef.current(files);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-image-picker
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          const mode = pickMode.current;
          pickMode.current = { type: "add" };
          if (mode.type === "replace") {
            const file = files.find((item) => item.type.startsWith("image/"));
            if (file) void replaceOne(mode.id, file);
            return;
          }
          void addFiles(files);
        }}
      />

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-widest text-ink-400">
          Images <span className="text-ink-500">· {count} of {MAX_IMAGE_OPTIONS} · one correct</span>
        </span>
        <span className="flex items-center gap-1">
          {action}
          <button
            type="button"
            onClick={() => openPicker({ type: "add" })}
            disabled={busy || atCap}
            className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800 disabled:opacity-40"
          >
            {busy ? "Adding…" : "Bulk images"}
          </button>
          <button
            type="button"
            onClick={() => {
              const options = latest.current.question.options;
              if (options.length >= MAX_IMAGE_OPTIONS) return;
              commit([...options, createOption()]);
            }}
            disabled={busy || atCap}
            className="focus-ring rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800 disabled:opacity-40"
          >
            + Add image
          </button>
        </span>
      </div>
      <p className="text-[11px] text-ink-500">
        Click an empty picture to upload it. + Add image adds one more answer. Bulk images adds several at once. Text under a picture is optional and only shows in play when you fill it in.
      </p>

      <div
        onDragOver={(event) => {
          if (![...event.dataTransfer.types].includes("Files")) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (![...event.dataTransfer.types].includes("Files")) return;
          event.preventDefault();
          setDragging(false);
          void addFiles(imagesFromTransfer(event.dataTransfer));
        }}
        className={`rounded-2xl ${dragging ? "ring-2 ring-[var(--accent)]" : ""}`}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
          modifiers={[restrictToParentElement]}
        >
          <SortableContext items={question.options.map((option) => option.id)} strategy={rectSortingStrategy}>
            <div role="radiogroup" aria-label="Image answers" className="w-full" style={imageChoiceGridStyle(count, gap)}>
              {question.options.map((option, index) => (
                <ImageTile
                  key={option.id}
                  option={option}
                  index={index}
                  selected={option.id === selected?.id}
                  disabled={busy}
                  onSelect={() => {
                    setSelectedId(option.id);
                    if (option.media) markCorrect(option.id);
                    else openPicker({ type: "replace", id: option.id });
                  }}
                  onText={(text) =>
                    commit(
                      latest.current.question.options.map((item) =>
                        item.id === option.id ? { ...item, text } : item,
                      ),
                    )
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      </div>

      {selected && (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => openPicker({ type: "replace", id: selected.id })}
            disabled={busy}
            className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-ink-300 hover:bg-ink-800 disabled:opacity-40"
          >
            Replace
          </button>
          <button
            type="button"
            onClick={() => remove(selected.id)}
            disabled={busy || count <= 2}
            className="focus-ring shrink-0 rounded-lg px-2 py-1 text-xs font-semibold text-ink-500 hover:text-bad disabled:opacity-25"
            aria-label="Remove selected image"
          >
            Remove
          </button>
        </div>
      )}

      {error && <p className="text-xs text-bad">{error}</p>}
    </div>
  );
}

function ImageTile({
  option,
  index,
  selected,
  disabled,
  onSelect,
  onText,
}: {
  option: Option;
  index: number;
  selected: boolean;
  disabled: boolean;
  onSelect: () => void;
  onText: (text: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex w-full flex-col items-center rounded-xl border p-1 ${
        option.correct
          ? "border-good ring-2 ring-good"
          : selected
            ? "border-[var(--accent)] ring-2 ring-[var(--accent)]"
            : "border-ink-700"
      } ${isDragging ? "z-10 opacity-90" : ""} ${option.media ? "" : "border-dashed"}`}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        role="radio"
        aria-checked={option.correct}
        aria-label={`Image ${index + 1}${option.correct ? ", correct answer" : ""}`}
        disabled={disabled}
        onClick={onSelect}
        className="focus-ring flex w-full flex-col items-center"
      >
        <span className="relative block aspect-[3/2] w-full overflow-hidden rounded-md bg-white">
          {option.media ? (
            <MediaImage media={option.media} className="h-full w-full object-contain" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[10px] font-semibold text-ink-500">Add</span>
          )}
          {option.correct && (
            <span
              aria-hidden
              className="absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-good text-[11px] font-bold text-ink-950"
            >
              ✓
            </span>
          )}
        </span>
        <span className="mt-1 text-xs font-semibold text-ink-200">{index + 1}</span>
      </button>
      <input
        value={option.text}
        onChange={(event) => onText(event.target.value)}
        onPointerDown={(event) => event.stopPropagation()}
        placeholder="Text"
        aria-label={`Optional text for image ${index + 1}`}
        disabled={disabled}
        className="focus-ring mt-1 w-full rounded-lg border border-ink-700 bg-ink-900/70 px-1.5 py-1 text-center text-xs text-ink-100 placeholder:text-ink-500"
      />
    </div>
  );
}
