import type { Question, Theme } from "../types/quiz.ts";

export function questionTheme(theme: Theme, question?: Question): Theme {
  const local = question?.background;
  return local?.enabled
    ? { ...theme, bgImage: local.image, bgImageFit: local.fit, bgImageDim: local.dim }
    : theme;
}

export function promptPosition(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
}
