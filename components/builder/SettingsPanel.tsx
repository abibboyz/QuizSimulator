"use client";

import type { Quiz, QuizSettings } from "@/types/quiz";
import { Field, Input, Textarea, Toggle } from "@/components/ui/Field";

interface Props {
  quiz: Quiz;
  onChangeQuiz: (patch: Partial<Quiz>) => void;
  onChangeSettings: (patch: Partial<QuizSettings>) => void;
}

export function SettingsPanel({ quiz, onChangeQuiz, onChangeSettings }: Props) {
  const { settings } = quiz;

  return (
    <div className="space-y-5">
      <Field label="Quiz title">
        <Input
          value={quiz.title}
          onChange={(event) => onChangeQuiz({ title: event.target.value })}
          placeholder="Name your quiz"
        />
      </Field>

      <Field label="Description">
        <Textarea
          value={quiz.description ?? ""}
          onChange={(event) => onChangeQuiz({ description: event.target.value })}
          placeholder="A line for the intro screen"
          rows={2}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Timer (seconds)" hint="0 for untimed">
          <Input
            type="number"
            min={0}
            max={600}
            value={settings.timerSeconds ?? 0}
            onChange={(event) => {
              const value = Number(event.target.value);
              onChangeSettings({ timerSeconds: value === 0 ? null : value });
            }}
          />
        </Field>

        <Field label="Base points">
          <Input
            type="number"
            min={0}
            max={100000}
            step={100}
            value={settings.pointsBase}
            onChange={(event) => onChangeSettings({ pointsBase: Number(event.target.value) })}
          />
        </Field>
      </div>

      <div className="space-y-2">
        <Toggle
          label="Speed bonus"
          hint="Up to 50% extra for answering fast"
          checked={settings.speedBonus}
          onChange={(speedBonus) => onChangeSettings({ speedBonus })}
        />
        <Toggle
          label="Streak multiplier"
          hint="Each correct answer in a row adds 10%, up to 1.5×"
          checked={settings.streakBonus}
          onChange={(streakBonus) => onChangeSettings({ streakBonus })}
        />
        <Toggle
          label="Reveal after each question"
          hint="Off means no feedback until the results screen"
          checked={settings.revealAfterEach}
          onChange={(revealAfterEach) => onChangeSettings({ revealAfterEach })}
        />
        <Toggle
          label="Shuffle questions"
          checked={settings.shuffleQuestions}
          onChange={(shuffleQuestions) => onChangeSettings({ shuffleQuestions })}
        />
        <Toggle
          label="Shuffle answers"
          checked={settings.shuffleOptions}
          onChange={(shuffleOptions) => onChangeSettings({ shuffleOptions })}
        />
        <Toggle
          label="Sound effects"
          hint="Ticks, stings, and a fanfare at the end"
          checked={settings.sound}
          onChange={(sound) => onChangeSettings({ sound })}
        />
      </div>

      <div className="space-y-2 rounded-2xl border border-ink-700 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Solo play</h3>

        <Toggle
          label="Keep going after a timeout"
          hint="Shows the answer, then moves on by itself"
          checked={settings.autoAdvanceOnTimeout}
          onChange={(autoAdvanceOnTimeout) => onChangeSettings({ autoAdvanceOnTimeout })}
        />

        {settings.autoAdvanceOnTimeout && (
          <Field label="Show the answer for (seconds)">
            <Input
              type="number"
              min={1}
              max={30}
              value={settings.timeoutRevealSeconds}
              onChange={(event) =>
                onChangeSettings({ timeoutRevealSeconds: Math.max(1, Number(event.target.value) || 1) })
              }
            />
          </Field>
        )}
      </div>

      <div className="space-y-2 rounded-2xl border border-ink-700 p-3">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-400">Host mode</h3>

        <Toggle
          label="Auto-reveal the answer"
          hint="Shows the answer by itself when the timer hits zero"
          checked={settings.autoReveal}
          onChange={(autoReveal) => onChangeSettings({ autoReveal })}
        />

        <Toggle
          label="Auto-advance after reveal"
          hint="Rolls on to the next question with no clicking"
          checked={settings.autoAdvanceSeconds !== null}
          onChange={(on) => onChangeSettings({ autoAdvanceSeconds: on ? 5 : null })}
        />

        {settings.autoAdvanceSeconds !== null && (
          <Field label="Wait before advancing (seconds)">
            <Input
              type="number"
              min={1}
              max={60}
              value={settings.autoAdvanceSeconds}
              onChange={(event) =>
                onChangeSettings({ autoAdvanceSeconds: Math.max(1, Number(event.target.value) || 1) })
              }
            />
          </Field>
        )}
      </div>
    </div>
  );
}
