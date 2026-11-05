import assert from "node:assert/strict"
import { test } from "node:test"
import { draggedTabIndex, tabPosition } from "../src/lib/touch-navigation.ts"

test("the glass selection aligns with each button center", () => {
  for (let index = 0; index < 5; index++) {
    assert.equal(tabPosition(20 + (index + 0.5) * 60, 20, 300, 5), index)
  }
})

test("the selection follows the finger continuously between buttons", () => {
  assert.equal(tabPosition(110, 20, 300, 5), 1)
  assert.equal(tabPosition(125, 20, 300, 5), 1.25)
})

test("dragging beyond either end clamps to the first or last button", () => {
  assert.equal(tabPosition(-200, 20, 300, 5), 0)
  assert.equal(tabPosition(800, 20, 300, 5), 4)
})

test("zero-width or empty navigation cannot select a button", () => {
  assert.equal(tabPosition(50, 20, 0, 5), 0)
  assert.equal(tabPosition(50, 20, 300, 0), 0)
  assert.equal(draggedTabIndex(50, 10, 110, 10, 20, 0, 5), null)
  assert.equal(draggedTabIndex(50, 10, 110, 10, 20, 300, 0), null)
})

test("dragging right selects the button under the finger", () => {
  assert.equal(draggedTabIndex(50, 10, 170, 12, 20, 300, 5), 2)
})

test("dragging left selects the button under the finger", () => {
  assert.equal(draggedTabIndex(230, 10, 110, 12, 20, 300, 5), 1)
})

test("one drag can scrub across multiple buttons, including More", () => {
  assert.equal(draggedTabIndex(50, 10, 290, 10, 20, 300, 5), 4)
  assert.equal(draggedTabIndex(290, 10, 50, 10, 20, 300, 5), 0)
})

test("taps and small finger movements leave native button clicks alone", () => {
  for (const delta of [0, 4, -4, 15, -15]) {
    assert.equal(draggedTabIndex(100, 10, 100 + delta, 10, 20, 300, 5), null)
  }
})

test("vertical and diagonal gestures do not select a page", () => {
  assert.equal(draggedTabIndex(100, 10, 102, 100, 20, 300, 5), null)
  assert.equal(draggedTabIndex(100, 10, 160, 70, 20, 300, 5), null)
})

test("release snaps to the nearest button without wrapping", () => {
  assert.equal(draggedTabIndex(50, 10, 139, 10, 20, 300, 5), 1)
  assert.equal(draggedTabIndex(50, 10, 141, 10, 20, 300, 5), 2)
  assert.equal(draggedTabIndex(50, 10, -100, 10, 20, 300, 5), 0)
  assert.equal(draggedTabIndex(50, 10, 600, 10, 20, 300, 5), 4)
})
