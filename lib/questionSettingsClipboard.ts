import type { BgImageFit, Question } from "@/types/quiz";
import {
  readQuestionSettings,
  writeQuestionSettings,
  type QuestionSettings,
} from "@/lib/questionSettingsClipboardState";

export function extractQuestionSettings(source: Question): Omit<QuestionSettings, "version" | "sourceQuizId"> {
  const result: Omit<QuestionSettings, "version" | "sourceQuizId"> = {};

  if (source.promptStyle) {
    const style = structuredClone(source.promptStyle);
    if (style.box?.image) {
      delete style.box.image;
    }
    result.promptStyle = style;
  }

  if (source.answerStyle) {
    result.answerStyle = structuredClone(source.answerStyle);
  }

  if (source.hideImageBoxes !== undefined) {
    result.hideImageBoxes = source.hideImageBoxes;
  }

  if (source.hideAnswerBoxes !== undefined) {
    result.hideAnswerBoxes = source.hideAnswerBoxes;
  }

  if (source.layout) {
    result.layout = source.layout;
  }

  if (source.promptPlacement) {
    result.promptPlacement = structuredClone(source.promptPlacement);
  }

  if (source.optionGap !== undefined) {
    result.optionGap = source.optionGap;
  }

  if (source.imageJoinerStyle) {
    const joinerStyle = structuredClone(source.imageJoinerStyle);
    if (joinerStyle.box?.image) {
      delete joinerStyle.box.image;
    }
    result.imageJoinerStyle = joinerStyle;
  }

  if (source.timerSeconds !== undefined) {
    result.timerSeconds = source.timerSeconds;
  }

  if (source.points !== undefined) {
    result.points = source.points;
  }

  if (source.loopMotion) {
    result.loopMotion = structuredClone(source.loopMotion);
  }

  if (source.motion) {
    result.motion = structuredClone(source.motion);
  }

  if (source.cues) {
    const cues = structuredClone(source.cues);
    for (const key of Object.keys(cues) as (keyof typeof cues)[]) {
      const cue = cues[key];
      if (cue) {
        if (cue.media) delete cue.media;
        if (cue.soundMedia) delete cue.soundMedia;
      }
    }
    result.cues = cues;
  }

  if (source.reveal) {
    const revealSettings = structuredClone(source.reveal);
    delete revealSettings.cover;
    delete revealSettings.caption;
    result.reveal = revealSettings;
  }

  if (source.celebration) {
    const celebrationSettings = structuredClone(source.celebration);
    delete celebrationSettings.image;
    result.celebration = celebrationSettings;
  }

  if (source.background) {
    result.background = {
      enabled: source.background.enabled,
      fit: source.background.fit,
      dim: source.background.dim,
    };
  }

  return result;
}

export function applyQuestionSettings(target: Question, settings: QuestionSettings): Question {
  const next: Question = { ...target };

  if (settings.promptStyle !== undefined) {
    next.promptStyle = structuredClone(settings.promptStyle);
  } else {
    delete next.promptStyle;
  }

  if (settings.answerStyle !== undefined) {
    next.answerStyle = structuredClone(settings.answerStyle);
  } else {
    delete next.answerStyle;
  }

  if (settings.hideImageBoxes !== undefined) {
    next.hideImageBoxes = settings.hideImageBoxes;
  } else {
    delete next.hideImageBoxes;
  }

  if (settings.hideAnswerBoxes !== undefined) {
    next.hideAnswerBoxes = settings.hideAnswerBoxes;
  } else {
    delete next.hideAnswerBoxes;
  }

  if (settings.layout !== undefined) {
    next.layout = settings.layout;
  }

  if (settings.promptPlacement !== undefined) {
    next.promptPlacement = structuredClone(settings.promptPlacement);
  } else {
    delete next.promptPlacement;
  }

  if (settings.optionGap !== undefined) {
    next.optionGap = settings.optionGap;
  } else {
    delete next.optionGap;
  }

  if (settings.imageJoinerStyle !== undefined) {
    next.imageJoinerStyle = structuredClone(settings.imageJoinerStyle);
  } else {
    delete next.imageJoinerStyle;
  }

  if (settings.timerSeconds !== undefined) {
    next.timerSeconds = settings.timerSeconds;
  } else {
    delete next.timerSeconds;
  }

  if (settings.points !== undefined) {
    next.points = settings.points;
  } else {
    delete next.points;
  }

  if (settings.loopMotion !== undefined) {
    next.loopMotion = structuredClone(settings.loopMotion);
  } else {
    delete next.loopMotion;
  }

  if (settings.motion !== undefined) {
    next.motion = structuredClone(settings.motion);
  } else {
    delete next.motion;
  }

  if (settings.cues !== undefined) {
    next.cues = structuredClone(settings.cues);
  } else {
    delete next.cues;
  }

  if (settings.reveal !== undefined) {
    const existingCover = target.reveal?.cover;
    const existingCaption = target.reveal?.caption;
    next.reveal = {
      ...structuredClone(settings.reveal),
      ...(existingCover ? { cover: existingCover } : {}),
      ...(existingCaption !== undefined ? { caption: existingCaption } : {}),
    };
  }

  if (settings.celebration !== undefined) {
    const existingImage = target.celebration?.image;
    next.celebration = {
      ...structuredClone(settings.celebration),
      ...(existingImage ? { image: existingImage } : {}),
    } as Question["celebration"];
  }

  if (settings.background !== undefined) {
    const existingImage = target.background?.image;
    const fit: BgImageFit = settings.background.fit ?? target.background?.fit ?? "cover";
    next.background = {
      enabled: settings.background.enabled,
      fit,
      dim: settings.background.dim ?? target.background?.dim ?? 0,
      ...(existingImage ? { image: existingImage } : {}),
    };
  }

  // Preserve content (text and images)
  next.id = target.id;
  next.kind = target.kind;
  next.prompt = target.prompt;
  next.media = target.media;
  next.options = target.options;
  next.explanation = target.explanation;
  next.imageJoiners = target.imageJoiners;

  return next;
}

/** Copies all question and prompt settings other than text and image. */
export async function copyQuestionSettings(sourceQuizId: string, question: Question): Promise<void> {
  const extracted = extractQuestionSettings(question);
  const settings: QuestionSettings = {
    version: 1,
    sourceQuizId,
    ...extracted,
  };
  writeQuestionSettings(settings);
}

/** Reads copied question settings and applies them onto the target question. */
export async function pasteQuestionSettings(question: Question): Promise<Question | null> {
  const copied = readQuestionSettings();
  if (!copied) return null;
  return applyQuestionSettings(question, copied);
}

/** Backwards compatibility aliases */
export const copyQuestionTextSettings = copyQuestionSettings;
export const pasteQuestionTextSettings = pasteQuestionSettings;
export function applyQuestionTextSettings(question: Question, promptStyle: Question["promptStyle"] | undefined): Question {
  if (!promptStyle) {
    if (!question.promptStyle) return question;
    const next = { ...question };
    delete next.promptStyle;
    return next;
  }
  return { ...question, promptStyle: structuredClone(promptStyle) };
}

