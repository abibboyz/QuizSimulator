import assert from "node:assert/strict";
import { test } from "node:test";
import { INITIAL_STARS, afterAnswer, afterChoice, atEnd, hasChoice, starsWorth } from "./stars.ts";

test("a correct answer puts stars in the pot; nothing is banked until the player chooses", () => {
  const { state, earned } = afterAnswer(INITIAL_STARS, true, 2);
  assert.deepEqual([earned, state], [2, { pot: 2, banked: 0, goStreak: 0 }]);
  assert.ok(hasChoice(earned) && !hasChoice(0));
});

test("Star banks the whole pot and resets the Go streak", () => {
  const a = afterAnswer({ pot: 3, banked: 5, goStreak: 2 }, true, 1);
  assert.deepEqual(afterChoice(a.state, "star"), { pot: 0, banked: 5 + 3 + 3, goStreak: 0 });
});

test("Go keeps the pot and makes the next correct answer worth more (x2, x3 …)", () => {
  let s = afterAnswer(INITIAL_STARS, true, 2).state;
  s = afterChoice(s, "go");
  assert.deepEqual(s, { pot: 2, banked: 0, goStreak: 1 });
  assert.equal(starsWorth(2, s), 4);
  const second = afterAnswer(s, true, 2);
  assert.equal(second.earned, 4);
  s = afterChoice(second.state, "go");
  assert.equal(starsWorth(2, s), 6);
  assert.deepEqual(afterChoice(afterAnswer(s, true, 2).state, "star"), { pot: 0, banked: 2 + 4 + 6, goStreak: 0 });
});

test("a wrong answer (or a timeout) loses the pot but never touches banked stars", () => {
  assert.deepEqual(afterAnswer({ pot: 6, banked: 4, goStreak: 2 }, false, 3), { state: { pot: 0, banked: 4, goStreak: 0 }, earned: 0 });
});

test("whatever is still in the pot at the end is banked", () => {
  assert.deepEqual(atEnd({ pot: 5, banked: 1, goStreak: 3 }), { pot: 0, banked: 6, goStreak: 0 });
});
