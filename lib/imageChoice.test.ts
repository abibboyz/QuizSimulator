import assert from "node:assert/strict";
import { test } from "node:test";
import {
  hidesImageBoxes,
  imageChoiceColumns,
  imageChoiceGridStyle,
  imageChoiceJoinedGridStyle,
  imageChoiceTile,
  imageColumnLayout,
  imageJoinerColumnGaps,
  imageJoinerGridPlace,
  imageJoinerSlots,
  imageJoinerStyled,
  imageJoinersActive,
  imageTileGridPlace,
  MAX_IMAGE_OPTIONS,
  withImageJoiner,
  withImageJoinersFilled,
} from "./imageChoice.ts";

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

test("between-image words follow horizontal neighbours only", () => {
  assert.deepEqual(imageJoinerSlots(1), []);
  assert.deepEqual(imageJoinerSlots(2), [0]);
  assert.deepEqual(imageJoinerSlots(3), [0, 1]);
  assert.deepEqual(imageJoinerSlots(4), [0, 2]);
  assert.deepEqual(imageJoinerSlots(5), [0, 2]);
  assert.deepEqual(imageJoinerSlots(12), [0, 1, 3, 4, 6, 7, 9, 10]);
  assert.equal(imageJoinersActive(1, ["VS"]), false);
  assert.equal(imageJoinersActive(2, undefined), false);
  assert.equal(imageJoinersActive(2, ["", " "]), false);
  assert.equal(imageJoinersActive(2, ["VS"]), true);
  assert.equal(imageJoinersActive(4, ["", "", "OR"]), true);
  assert.equal(imageJoinerStyled(undefined), false);
  assert.equal(imageJoinerStyled({}), false);
  assert.equal(imageJoinerStyled({ color: "#abcdef" }), true);
});

test("blank between-image words leave the grid and tile math alone", () => {
  assert.equal(imageJoinerColumnGaps(2, 812, 12, undefined, () => 80), null);
  assert.equal(imageJoinerColumnGaps(4, 812, 12, ["", " "], () => 80), null);
  assert.deepEqual(imageChoiceTile(2, 812, 12), { w: 400, offset: 0 });
  assert.deepEqual(imageChoiceGridStyle(4, 12), {
    display: "grid",
    gap: "12px",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  });
  const plain = imageColumnLayout(4, 812, 12, null);
  const tile = imageChoiceTile(4, 812, 12);
  assert.equal(plain.colW, tile.w);
  assert.equal(plain.colX, tile.offset);
  assert.equal(plain.left(0), tile.offset);
  assert.equal(plain.left(1), tile.offset + tile.w + 12);
});

test("a between-image word widens its column and stays inside the frame", () => {
  // Glyph width plus the tile gap on each side. A blank neighbour stays one gap.
  assert.deepEqual(imageJoinerColumnGaps(3, 900, 12, ["VS", "OR"], (text) => (text === "VS" ? 30 : 24)), [54, 48]);
  assert.deepEqual(imageJoinerColumnGaps(3, 900, 12, ["VS", ""], () => 30), [54, 12]);
  // Both labels share the one column of a two-across grid, so the wider one wins.
  const shared = imageJoinerColumnGaps(4, 800, 12, ["OR", "", "This or That"], (text) => text.length * 10);
  assert.deepEqual(shared, [Math.max(12, "This or That".length * 10 + 24)]);
  const wide = imageJoinerColumnGaps(2, 200, 12, ["too long"], () => 500);
  assert.ok(wide);
  assert.ok(wide[0] < 200);
  assert.ok(wide[0] >= 12);
  const layout = imageColumnLayout(2, 200, 12, wide);
  assert.ok(layout.colW >= 8);
  assert.ok(Math.abs(layout.left(1) - layout.left(0) - layout.colW - wide[0]) < 1e-6);
  assert.equal(
    imageChoiceJoinedGridStyle(2, 12).gridTemplateColumns,
    "minmax(0, 1fr) minmax(12px, max-content) minmax(0, 1fr)",
  );
  assert.equal(imageChoiceJoinedGridStyle(2, 12).rowGap, "12px");
  assert.equal(imageChoiceJoinedGridStyle(2, 12).columnGap, "0px");
  assert.deepEqual(imageTileGridPlace(1, 2), { gridColumn: 3, gridRow: 1 });
  assert.deepEqual(imageJoinerGridPlace(0, 2), { gridColumn: 2, gridRow: 1 });
  assert.deepEqual(imageTileGridPlace(2, 2), { gridColumn: 1, gridRow: 2 });
});

test("clearing every between-image word drops the field", () => {
  assert.deepEqual(withImageJoiner({ options: [{}, {}, {}] }, 1, "OR"), ["", "OR", ""]);
  assert.equal(withImageJoiner({ options: [{}, {}], imageJoiners: ["VS", ""] }, 0, "   "), undefined);
  assert.equal(withImageJoiner({ options: [{}, {}, {}, {}] }, 1, "NO"), undefined);
  assert.deepEqual(withImageJoinersFilled(3, "VS"), ["VS", "VS", ""]);
  assert.deepEqual(withImageJoinersFilled(4, "AND"), ["AND", "", "AND", ""]);
  assert.equal(withImageJoinersFilled(1, "VS"), undefined);
});

test("image boxes inherit globally and keep a per-question override", () => {
  assert.equal(hidesImageBoxes({ hideImageBoxes: false }, {}), false);
  assert.equal(hidesImageBoxes({ hideImageBoxes: true }, {}), true);
  assert.equal(hidesImageBoxes({ hideImageBoxes: true }, { hideImageBoxes: false }), false);
  assert.equal(hidesImageBoxes({ hideImageBoxes: false }, { hideImageBoxes: true }), true);
});
