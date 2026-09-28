#!/usr/bin/env node
/**
 * Layout-stability regression check (Reveal cover growth bug).
 *
 * Seeds Reveal quizzes (square / tall / wide cover, and no cover), opens the
 * builder, solo play and host mode in web and mobile viewports, then idles,
 * scrolls (wheel on web, touch gestures on mobile) and resizes, recording the
 * laid-out size of every <img> and <canvas>. Fails if anything changes size.
 *
 * Before the fix, the builder's reveal preview (which shows the cover) grew by
 * about a pixel a frame: 123×192 → 123×525 within a few seconds at 1280×800.
 *
 * Usage (against a running build):
 *   npm run build && npx next start -p 3000 &
 *   BASE=http://localhost:3000 npm run test:layout
 * Env: BASE, CHROME_PATH (defaults to /usr/bin/google-chrome, else the
 * installed Chrome channel), CYCLES (default 8), VIEWS (web,mobile), PAGES
 * (edit,play,host).
 */
import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE = process.env.BASE || "http://localhost:3000";
const CYCLES = Number(process.env.CYCLES || 8);
const VIEWS = (process.env.VIEWS || "web,mobile").split(",");
const PAGES = (process.env.PAGES || "edit,play,host").split(",");
const CHROME = process.env.CHROME_PATH || (existsSync("/usr/bin/google-chrome") ? "/usr/bin/google-chrome" : undefined);

const VIEWPORTS = {
  web: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
  web2x: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 },
  mobile: { viewport: { width: 400, height: 860 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true },
  mobile3: { viewport: { width: 393, height: 851 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
};

const SIZES = {
  "a-wide": [800, 450],
  "a-tall": [450, 700],
  "a-sq": [500, 500],
  "a-wide2": [900, 400],
  "c-sq": [600, 600],
  "c-tall": [400, 900],
  "c-wide": [1200, 400],
};
const pic = (id) => ({ kind: "stored", id, w: SIZES[id][0], h: SIZES[id][1] });
const answers = ["a-wide", "a-tall", "a-sq", "a-wide2"];
const revealQ = (reveal) => ({
  id: "rq1",
  kind: "reveal",
  layout: "grid",
  prompt: `Which city is under the cover? (${reveal.animation})`,
  optionGap: 12,
  options: ["Paris", "Rome", "Oslo", "Lima"].map((text, i) => ({
    id: `o${i}`,
    text,
    correct: i === 0,
    media: pic(answers[(i + 1) % 4]),
  })),
  reveal,
});
const settings = { cues: {}, timerSeconds: null, sound: false };
const QUIZZES = [
  {
    id: "ls-sq",
    title: "Layout: square cover",
    settings,
    questions: [revealQ({ animation: "tiles", cover: pic("c-sq"), caption: "It's Paris" })],
  },
  {
    id: "ls-tall",
    title: "Layout: tall cover",
    settings,
    questions: [revealQ({ animation: "zoom", cover: pic("c-tall") })],
  },
  {
    id: "ls-wide",
    title: "Layout: wide cover",
    settings,
    questions: [revealQ({ animation: "iris", cover: pic("c-wide") })],
  },
  {
    id: "ls-none",
    title: "Layout: no cover",
    settings,
    questions: [revealQ({ animation: "blur", coverFallback: "blur" })],
  },
];

/** Runs in the page: draws the pictures and writes quizzes + media to IndexedDB. */
async function seed({ quizzes, sizes }) {
  const db = await new Promise((res, rej) => {
    const r = indexedDB.open("quiz-simulator");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  const all = await new Promise((res) => {
    const r = db.transaction("quizzes").objectStore("quizzes").getAll();
    r.onsuccess = () => res(r.result);
  });
  const base = all[0];
  const draw = (id, w, h) =>
    new Promise((res) => {
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const x = c.getContext("2d");
      x.fillStyle = id.startsWith("c-") ? "#2d5fb8" : `hsl(${(id.length * 47) % 360} 80% 50%)`;
      x.fillRect(0, 0, w, h);
      x.fillStyle = "#fff";
      x.font = `bold ${Math.round(Math.min(w, h) / 3)}px sans-serif`;
      x.textAlign = "center";
      x.textBaseline = "middle";
      x.fillText(id.startsWith("c-") ? "?" : id.slice(2).toUpperCase(), w / 2, h / 2);
      c.toBlob(res, "image/png");
    });
  const media = [];
  for (const [id, [w, h]] of Object.entries(sizes))
    media.push({ id, blob: await draw(id, w, h), w, h, createdAt: Date.now() });
  const tx = db.transaction(["media", "quizzes"], "readwrite");
  for (const m of media) tx.objectStore("media").put(m);
  for (const q of quizzes) {
    tx.objectStore("quizzes").put({
      ...structuredClone(base),
      ...q,
      theme: { ...base.theme, bgAnimation: "none" },
      settings: { ...base.settings, ...q.settings },
      updatedAt: Date.now(),
    });
  }
  await new Promise((res) => (tx.oncomplete = res));
}

function measure() {
  return [...document.querySelectorAll("img, canvas")].map((el, i) => {
    const r = el.getBoundingClientRect();
    return {
      i,
      tag: el.tagName,
      label: el.getAttribute("aria-label") || el.getAttribute("alt") || "",
      w: +r.width.toFixed(2),
      h: +r.height.toFixed(2),
    };
  });
}

const browser = await chromium.launch({
  headless: true,
  ...(CHROME ? { executablePath: CHROME } : { channel: "chrome" }),
});
let failures = 0;
for (const view of VIEWS) {
  const ctx = await browser.newContext(VIEWPORTS[view]);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE + "/");
  await page.waitForFunction(() => document.body.innerText.length > 20, null, { timeout: 30000 });
  await page.waitForTimeout(800);
  await page.evaluate(seed, { quizzes: QUIZZES, sizes: SIZES });

  for (const route of PAGES) {
    for (const quiz of QUIZZES) {
      const url =
        route === "edit"
          ? `/edit?quiz=${quiz.id}`
          : route === "play"
            ? `/play?quiz=${quiz.id}&view=${view.startsWith("mobile") ? "mobile" : "web"}`
            : `/host?quiz=${quiz.id}`;
      await page.goto(BASE + url);
      await page.waitForTimeout(1000);
      if (route === "play") {
        await page.getByRole("button", { name: "Start quiz" }).click();
        await page.waitForTimeout(1200);
      }
      for (const phase of route === "edit" ? ["covered", "played"] : ["covered", "revealed"]) {
        if (phase === "played")
          await page
            .getByRole("button", { name: /Play reveal/ })
            .first()
            .evaluate((b) => b.click());
        if (phase === "revealed") {
          if (route === "play")
            await page
              .getByRole("button", { name: /Paris/ })
              .first()
              .evaluate((b) => b.click());
          else await page.keyboard.press("Space");
        }
        await page.waitForTimeout(1600);
        const first = await page.evaluate(measure);
        await page.waitForTimeout(1500); // idle: the old bug grew without any input
        for (let c = 0; c < CYCLES; c++) {
          if (view.startsWith("mobile")) {
            const cdp = await ctx.newCDPSession(page);
            await cdp.send("Input.synthesizeScrollGesture", {
              x: 200,
              y: 600,
              yDistance: -500,
              speed: 3000,
              gestureSourceType: "touch",
            });
            await cdp.send("Input.synthesizeScrollGesture", {
              x: 200,
              y: 300,
              yDistance: 500,
              speed: 3000,
              gestureSourceType: "touch",
            });
            await cdp.detach();
          } else {
            await page.mouse.move(640, 400);
            await page.mouse.wheel(0, 700);
            await page.waitForTimeout(60);
            await page.mouse.wheel(0, -700);
          }
          if (c % 4 === 3) {
            // A mobile URL bar showing/hiding, or a window resize.
            const v = VIEWPORTS[view].viewport;
            await page.setViewportSize({ width: v.width, height: v.height - 120 });
            await page.waitForTimeout(100);
            await page.setViewportSize(v);
          }
          await page.waitForTimeout(100);
        }
        await page.waitForTimeout(400);
        const last = await page.evaluate(measure);
        const changed = last
          .filter((e) => {
            const f = first.find((x) => x.i === e.i && x.tag === e.tag);
            return f && (Math.abs(f.h - e.h) > 0.5 || Math.abs(f.w - e.w) > 0.5);
          })
          .map((e) => {
            const f = first.find((x) => x.i === e.i);
            return `${e.tag}[${e.label}] ${f.w}×${f.h} → ${e.w}×${e.h}`;
          });
        const key = `${view} ${route} ${quiz.id} ${phase}`;
        if (changed.length) failures++;
        console.log(
          `${changed.length ? "FAIL" : "ok  "} ${key}: ${changed.length ? changed.join("; ") : `${first.length} img/canvas stable`}`,
        );
      }
    }
  }
  if (errors.length) {
    failures++;
    console.log(`FAIL ${view}: page errors ${JSON.stringify(errors)}`);
  }
  await ctx.close();
}
await browser.close();
console.log(failures ? `\n${failures} check(s) failed` : "\nAll img/canvas sizes stable.");
process.exit(failures ? 1 : 0);
