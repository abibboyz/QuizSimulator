# New question types

Six new question types. They are additive: existing question types, settings and saved quizzes are unchanged.
Everything is drawn by the one canvas renderer (`lib/videoExport/renderer.ts`), so each type works the same way in
the builder preview (Web 16:9 and Mobile 9:16), live Play, Host and video export. Every animation is a pure function
of the timeline clock, which is what makes preview and export identical.

| Type (builder label) | Add button | What the player does |
| --- | --- | --- |
| Memory / flip (`memory-flip`) | Game types → **+ Memory** | Looks during the *remember time*, then picks the right card(s). **Flip**: cards turn face down with a real card flip. **Recall**: the items disappear and every answer comes back in a new order. |
| Pop (`pop-match`) | **+ Pop** | Answers pop up one by one at random places, or fly in from the edges. The player taps the correct ones. |
| Star / Go (`star-collect`) | **+ Star/Go** | Answers a normal question; a correct answer puts animated stars in the pot, then chooses **Star** (bank) or **Go** (carry on). |
| Drag (`drag-match`) | **+ Drag** | Drags an item onto the answer it matches, with an animated drag handle. Tapping an answer also works. |
| Order (`sequence`) | **+ Order** | Taps the answers in the correct order (the list order in the builder *is* the answer; players see it shuffled). |
| Timed (`timed-reveal`) | **+ Timed** | Answers appear one at a time; the player can answer as soon as the right one is up. |

## Where the settings live

Question editor → **Game settings** panel (between Timer/Points and *Animation*). It only shows for the six new types
and uses the same fields/toggles as the other question settings. Settings are per question (`question.game`).

| Setting | Types | Range / default |
| --- | --- | --- |
| Animations (on/off) | all six | on. Off = changes happen instantly (no flip/pop/drag motion). |
| Speed (slow/normal/fast) | all six | normal |
| Style (Flip / Recall) | memory | flip |
| Remember time (s) | memory | 1–15, default 3. The question timer includes it. |
| Card back | memory (flip) | any character/emoji, default `?` |
| Pop from (Random / Edges / Both) | pop | random |
| Items at once | pop | 1–5 (never more than the answers), default 3 |
| Stays up (s) | pop | 1.2–6, default 2.6 |
| Stars per correct answer | star | 1–5, default 3 |
| Preview / video picks (Star / Go) | star | star: what the simulated player does in preview and export |
| Seconds between answers | timed | 0.4–5, default 1.2 |
| Item to drag | drag | word or emoji; the question picture is used instead when there is one |
| Drag handle: **Stick / Hand / Custom image** | drag | Stick |

Answers: Memory, Pop and Timed can have several correct answers (then the player picks them all and presses Submit).
Drag and Star/Go have exactly one. Order has no tick (the list order is the answer).
Existing theme, text-style, header and timer settings apply to the new types as they do to the old ones.

## Drag handle

* **Stick** (default) and **Hand** are shipped transparent SVGs in `public/drag-handles/` (`stick.svg`, `hand.svg`,
  `hand-grab.svg`; the hand closes while dragging). They are cached by the service worker.
* **Custom image** uses the existing `MediaDropZone`, so the user can upload or replace their own image at any time.
  A transparent PNG is best. **Animated GIFs are supported and keep animating** (same pipeline as other pictures:
  stored byte-for-byte, up to 12 MB). The middle of the picture is the pointer tip. With no image uploaded the Stick is used.
  Switching back to Stick/Hand keeps the uploaded image, so you can switch back.
* The handle follows the pointer (hover or drag), tilts with the pointer's speed and wiggles; it rests next to the item
  when nothing is moving. In preview and export a scripted drag plays instead.
* **GIF in the exported video:** the GIF is decoded into frames and the frame is chosen from the video clock, so the
  export is identical on any machine and the GIF loops from the start of the video (it is not restarted when the drag
  begins). Verified: the exported MP4 shows the GIF cycling its colours (`/workspace/qs-newtypes-check/gif/`).

## Star / Go rules

See `lib/stars.ts` (unit-tested). A correct answer is worth `stars × (1 + goStreak)` stars, put in the pot.
Star banks the pot and resets goStreak. Go keeps the pot and raises goStreak by 1, so the next correct star question
is worth ×2, ×3 … A wrong answer or a timeout loses the pot (banked stars are safe). No choice (Enter, auto-advance, the
clock) counts as Star. Stars still in the pot when the quiz ends are banked.

**Points rule (Star/Go questions only):** banked stars also add to the score. A star is worth **a tenth of the quiz's
base points** (*Settings → base points*, 1000 by default, so **100 points a star**). The points are added when the stars
are banked: on **Star**, on "no choice" (counts as Star), and at the end of the quiz for stars still in the pot. Stars
that are only carried with **Go**, or lost with a wrong answer / timeout, are worth nothing. The row of the question
where they were banked shows `⭐ +N` and the total (so the score always equals the sum of the rows). Streaks and the
points of every other question are never affected, and a quiz without a Star/Go question scores exactly as before.
The same rule runs in Play, the results screen and the exported video (the Star button and the "Banked!" message show
the points). Host is a display with its own manual team scores, so it adds nothing automatically.

Keys in Play: **S** = Star, **G** = Go, Enter = Star.

## Existing data

* `SCHEMA_VERSION` 10 → **11**. A quiz is stamped 11 only when it contains one of the new kinds; every other quiz
  keeps the stamp it always had, so older builds still open it. An older build rejects a file that uses the new kinds.
* No migration is needed: the new fields (`question.game`, new `kind` values) are optional. Old quizzes load and
  round-trip byte-identical (tested).
* Classic kinds take their original code paths (explicit `isGameKind` checks); the tile drawing was wrapped, not rewritten.

## Coverage

| | Builder | Preview Web / Mobile | Play | Host | Video export |
| --- | --- | --- | --- | --- | --- |
| Memory/flip, Recall | ✓ | ✓ | ✓ | ✓ (shown, no picking) | ✓ |
| Pop | ✓ | ✓ | ✓ | ✓ | ✓ |
| Star/Go | ✓ | ✓ | ✓ (buttons + S/G) | stars appear; no per-player tally | ✓ |
| Drag (+ handle, GIF) | ✓ | ✓ | ✓ (pointer drag) | handle rests/wiggles; shows the answer on reveal | ✓ |
| Order | ✓ | ✓ | ✓ | ✓ | ✓ |
| Timed | ✓ | ✓ | ✓ | ✓ | ✓ |

## Known limits

* Memory: the question timer includes the remember time, and picking is locked until the flip finishes (set a timer longer than the remember time).
* Host is a display: no per-player picks, drag or star tally.
* Drag needs a pointer; keyboard/screen-reader users use the answer buttons (tap an answer instead of dragging).
* Animated GIF/APNG/WebP (handle or any picture) needs the browser's `ImageDecoder` (Chrome, Edge). Without it the first frame is shown, as for every other animated picture in the app.
* The pop field is a fixed grid (4×3 cells) inside a framed area; items never overlap the prompt.
* "Copy question settings" is unchanged (prompt settings only). Game settings are kept when a question is duplicated or copied between quizzes.
* Video export follows the dialog's *Answers* option. **Show correct pick** plays every new type through (memory flip then pick, pops tapped, scripted drag with the handle, order tapped, stars with the Star/Go choice from *Preview / video picks*). **Let the clock run out** means nobody answers, so the new types time out and show their answer, like every other type. This is the intended behaviour. The builder preview always plays the new types through so you can see them.

## How to try each type (test checklist)

1. Open a quiz → Game types → **+ Memory**. Fill the answers, tick one. Preview: cards show, turn over with a flip, "Which card was it?". Try Recall, remember time 1 s and 8 s, Animations off, Speed fast. Play it.
2. **+ Pop**: tick two answers, set *Pop from* Random / Edges / Both, items at once 1 and 4. Preview Web and Mobile; Play and tap the right ones, Submit.
3. **+ Star/Go**: answer correctly → stars pop → Star banks, Go carries (next is ×2). Try S/G keys; answer wrong to lose the pot; check the results Stars tile.
4. **+ Drag**: preview shows a scripted drag; in Play grab the item and drop it on an answer. Switch the handle Stick / Hand / Custom. For Custom upload a transparent PNG, then replace it with an animated GIF and check it keeps animating in builder preview, Play, Host and in the exported video.
5. **+ Order**: reorder the list in the builder; Play: tap the answers in order (a wrong order shows the right one).
6. **+ Timed**: answers appear one by one; answer early.
7. Export video → *Answers: Show correct pick*: each new type is played through (also try Vertical). Check the GIF handle keeps animating.
8. For each: switch the Web 16:9 / Mobile 9:16 preview, change text style / theme / header toggles, Host (`/host`), Export video.
9. Regression: existing multiple-choice, true/false, multi-select, image-choice and reveal questions look and behave as before.
