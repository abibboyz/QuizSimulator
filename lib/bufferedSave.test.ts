import assert from "node:assert/strict";
import { test } from "node:test";
import { BufferedSave } from "./bufferedSave.ts";

test("navigation flush saves the latest edit without waiting for debounce", async () => {
  const saved: string[] = [];
  const saver = new BufferedSave<string>(async value => { saved.push(value); }, () => {});
  saver.update("first"); saver.update("latest");
  await saver.flush();
  assert.deepEqual(saved, ["latest"]);
  await saver.flush();
  assert.deepEqual(saved, ["latest"]);
});

test("failed saves can retry and never overwrite a newer queued edit", async () => {
  const saved: string[] = [];
  const statuses: string[] = [];
  let fail = true;
  const saver = new BufferedSave<string>(async value => {
    if (fail) { fail = false; throw new Error("Quota"); }
    saved.push(value);
  }, state => statuses.push(state));
  saver.update("retry me");
  await saver.flush();
  assert.equal(statuses.at(-1), "error");
  await saver.flush();
  assert.deepEqual(saved, ["retry me"]);
  fail = true;
  saver.update("stale");
  const old = saver.flush();
  saver.update("new");
  const next = saver.flush();
  await Promise.all([old, next]);
  await saver.flush();
  assert.deepEqual(saved, ["retry me", "new"]);
  assert.equal(statuses.at(-1), "saved");
});
