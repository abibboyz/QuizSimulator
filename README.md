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

- Four question types: multiple choice, true/false, pick-all-that-apply, and **image** (a numbered picture grid, up to 100 images, one correct — no answer bullets)
- Drag questions to reorder them, drag answers within a question; arrow buttons do the same job on touch screens and from the keyboard
- Images on questions *and* on individual answers — drag one in, click to browse, or **paste straight from the clipboard**
- Four layouts per question: grid, list, image-first, big type
- Theme each quiz: five palettes, custom accent and stage colours, three fonts, and five animated backgrounds (aurora, particles, floating shapes, starfield, none)
- **Background image with GIF support** — drop in a picture or an animated GIF, choose fill/fit/tile, and dial in a dim level so the question stays readable. Animated files (GIF, APNG, animated WebP) are stored untouched so they keep moving; everything else is downscaled
- Live preview that renders the real play stage, so what you design is what plays
- **Motion & sound cues** — quiz-wide defaults plus per-question overrides, with optional custom cue audio
- Autosaves as you type

**Solo play** (`/play/[quizId]`)

Per-question countdown, instant reveal with an explanation, speed bonus, streak multiplier, and a results screen with a per-question breakdown and a "retry the ones I missed" button.

**Run out of time and the quiz keeps itself moving:** the correct answer is revealed, a countdown shows how long until the next question (5 seconds by default, editable under **Settings → Solo play**), and it carries on — through to the results screen if that was the last one. A question you actually *answered* stays put, so you can read the explanation at your own pace. The whole behaviour can be switched off.

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

## Motion & sound

Quizzes can play a short animation and/or sound at named moments in a run:

| Slot | When it fires |
| --- | --- |
| **Quiz start** (`intro`) | Before the first question |
| **Correct answer** | When a player gets one right |
| **Wrong answer** | When a player misses |
| **Between questions** | After an answer, before the next question |
| **Results** (`outro`) | When the quiz finishes |

Defaults live under **Settings → Motion & sound** (quiz-wide). Each question has its own **Motion & sound** section for `correct` / `wrong` / `between` overrides — leave a row on the quiz default to inherit it, or set it to silent to opt out.

Built-in motion includes countdown, confetti, stars, pulse ring, shake, stamp, and a custom image/GIF. Built-in sounds (start, correct, wrong, whoosh, riser, buzz, fanfare, consolation) are synthesized in the browser. Pick **Custom sound…** on a cue to upload your own file through the audio drop zone; it travels with **Export** / **Import** like images.

New and sample quizzes ship with a small **post pack** (countdown + start, confetti + correct, shake + wrong, pulse + whoosh, stars + fanfare). Use **Apply post pack** in Settings to restore it on an existing quiz.

## Scoring

```
correct & untimed  → base points
correct & timed    → base + round(base × fractionOfTimeLeft × 0.5)
streak multiplier  → × (1 + min(streak, 5) × 0.1)     // caps at 1.5×
wrong or timed out → 0, and the streak resets
```

All of it is configurable per quiz, and overridable per question.

## Installing it / offline

It's a Progressive Web App. Open it, and your browser will offer to install it — "Install" in Chrome's address bar, or *Share → Add to Home Screen* on iOS. It then launches in its own window with no browser chrome.

**It works with no internet at all.** A service worker precaches the whole app — all five pages, the CSS, JS, and fonts — on your first visit. After that you can build, play, and host quizzes with the network completely off. Verified by killing the server outright and playing a full question.

That works because every route is a static page and the quiz id travels as a query param (`/play?quiz=abc`) rather than a path segment. A dynamic route could only ever be cached per-quiz after visiting that exact quiz online; this way one cached page covers every quiz, including ones created while offline.

Deploys are picked up automatically: pages are fetched network-first, so a new version lands as soon as you're back online, and old caches are cleared on activation.

### What it doesn't do

**There's no online sync, because there's no server.** Vercel serves the app's files; it never sees your quizzes. Everything lives in your browser, so quizzes don't travel between devices or browsers on their own — use **Export** and **Import** to move one. Real sync (and Background Sync, which exists to push local changes to a server) would need the backend listed under *Not built yet*.

## Where your quizzes live

In this browser, in IndexedDB — not localStorage, because images would blow through its ~5MB cap. Images are downscaled to 1600px and re-encoded as WebP on the way in, which takes a 6MB phone photo down to a couple of hundred KB with no visible loss on a projector.

**Export** writes one self-contained `.json` with the images (and any custom cue audio) inlined — a quiz backup/share file, **not** a video export. **Import** validates it, rebuilds the media, and regenerates every id so importing a quiz you already have can't collide with it.

Deleting a quiz garbage-collects any images nothing else references.

## Accessibility

`prefers-reduced-motion` turns off the animated backgrounds and the confetti and collapses transitions — the app stays fully usable. Drag-and-drop has a keyboard path, and reordering also works through plain buttons.

## Deploying

Push to GitHub and import the repo at [vercel.com/new](https://vercel.com/new). Next.js is detected automatically and there are no environment variables to set.

```bash
npm run build
```

## Tests

```bash
npm test
```

Node's built-in runner, no dependencies. Coverage is thin — it covers the auto-advance rules in `lib/autoAdvance.ts`, where the "keep going after a timeout, but not after an answer" distinction is easy to break by accident.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · dnd-kit · zustand · idb · canvas-confetti. Built-in cue sounds are synthesized with the Web Audio API (nothing to ship for those); authors can also drop in custom cue audio via **AudioDropZone**, which is stored with the quiz like images.

## Not built yet

- Free-form canvas layout (drag elements anywhere on a slide)
- Multi-device live join, where players answer on their phones with a room code — this one needs a realtime backend, which is why it isn't here
- Audio and video clips *as question content* (custom sounds on cues already work)
