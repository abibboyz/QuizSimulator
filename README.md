# Quiz Simulator

Build quizzes with images and themes, then run them — solo, or on the big screen for a room.

Everything lives in your browser. No account, no server, no database.

## Running it

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:3000. A sample quiz is seeded on first visit so there's something to play immediately.

## What it does

**Template builder** (`/edit/[quizId]`)

- Three question types: multiple choice, true/false, and pick-all-that-apply
- Drag questions to reorder them, drag answers within a question; arrow buttons do the same job on touch screens and from the keyboard
- Images on questions *and* on individual answers — drag one in, click to browse, or **paste straight from the clipboard**
- Four layouts per question: grid, list, image-first, big type
- Theme each quiz: five palettes, custom accent and stage colours, three fonts, and five animated backgrounds (aurora, particles, floating shapes, starfield, none)
- **Background image with GIF support** — drop in a picture or an animated GIF, choose fill/fit/tile, and dial in a dim level so the question stays readable. Animated files (GIF, APNG, animated WebP) are stored untouched so they keep moving; everything else is downscaled
- Live preview that renders the real play stage, so what you design is what plays
- Autosaves as you type

**Solo play** (`/play/[quizId]`)

Per-question countdown, instant reveal with an explanation, speed bonus, streak multiplier, and a results screen with a per-question breakdown and a "retry the ones I missed" button.

Pick the play surface before you start, with the toggle beside **Play** (or on the intro screen):

- **Web** — wide layout, answers in a 2×2 grid, number keys to answer and Enter to advance
- **Mobile** — phone-width column, one answer per row, touch-sized tiles. On a desktop it's framed like a phone so you can see how it'll look; on an actual phone it just fills the screen

The choice is remembered, defaults to mobile on touch devices, and rides along in the URL (`?view=mobile`) so a link opens the way you meant it to.

**Host mode** (`/host/[quizId]`)

Big-screen presentation for a room. You control the pacing: `Space` reveals the answer, `←`/`→` move between questions, `F` goes fullscreen. Includes a manual team scoreboard that survives a refresh.

Two checkboxes under **Settings → Host mode** make it run itself:

- **Auto-reveal the answer** — the answer appears on its own when the timer hits zero
- **Auto-advance after reveal** — moves to the next question after a delay you set

With both on, you press play once and the whole quiz runs hands-free. Arrow keys still take over at any point, and it always stops on the last question rather than running off the end.

## Scoring

```
correct & untimed  → base points
correct & timed    → base + round(base × fractionOfTimeLeft × 0.5)
streak multiplier  → × (1 + min(streak, 5) × 0.1)     // caps at 1.5×
wrong or timed out → 0, and the streak resets
```

All of it is configurable per quiz, and overridable per question.

## Where your quizzes live

In this browser, in IndexedDB — not localStorage, because images would blow through its ~5MB cap. Images are downscaled to 1600px and re-encoded as WebP on the way in, which takes a 6MB phone photo down to a couple of hundred KB with no visible loss on a projector.

**Export** writes one self-contained `.json` with the images inlined, so a single file is the whole quiz. **Import** validates it, rebuilds the images, and regenerates every id so importing a quiz you already have can't collide with it.

Deleting a quiz garbage-collects any images nothing else references.

## Accessibility

`prefers-reduced-motion` turns off the animated backgrounds and the confetti and collapses transitions — the app stays fully usable. Drag-and-drop has a keyboard path, and reordering also works through plain buttons.

## Deploying

Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new). Next.js is detected automatically and there are no environment variables to set.

```bash
npm run build
```

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · dnd-kit · zustand · idb · canvas-confetti. Sound effects are synthesized with the Web Audio API, so there are no audio files to ship.

## Not built yet

- Free-form canvas layout (drag elements anywhere on a slide)
- Multi-device live join, where players answer on their phones with a room code — this one needs a realtime backend, which is why it isn't here
- Audio and video clips in questions
