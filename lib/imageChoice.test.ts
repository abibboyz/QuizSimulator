import assert from "node:assert/strict";
import { test } from "node:test";
import { imageChoiceColumns, MAX_IMAGE_OPTIONS } from "./imageChoice.ts";

test("a picture grid matches a flag round and shrinks as it fills", () => {
  assert.equal(imageChoiceColumns(2), 2);
  assert.equal(imageChoiceColumns(12), 3);
  assert.equal(imageChoiceColumns(MAX_IMAGE_OPTIONS), 10);
  assert.ok(1 / imageChoiceColumns(2) > 1 / imageChoiceColumns(12));
  assert.ok(1 / imageChoiceColumns(12) > 1 / imageChoiceColumns(MAX_IMAGE_OPTIONS));
});

test("column count never exceeds the number of images", () => {
  for (let count = 1; count <= MAX_IMAGE_OPTIONS; count++) {
    const columns = imageChoiceColumns(count);
    assert.ok(columns >= 1 && columns <= count);
  }
});
