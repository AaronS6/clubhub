import assert from "node:assert/strict"
import { test } from "node:test"
import { swipeDestination } from "../src/lib/touch-navigation.ts"

const pages = ["dashboard", "meetings", "tasks", "chat", "announcements"] as const

test("left and right swipes follow the navigation order", () => {
  assert.equal(swipeDestination(pages, "tasks", -80, 5), "chat")
  assert.equal(swipeDestination(pages, "tasks", 80, -5), "meetings")
})

test("a tap or a short drag does not navigate", () => {
  for (const distance of [0, 12, -20, 47, -47]) {
    assert.equal(swipeDestination(pages, "tasks", distance, 0), null)
  }
  assert.equal(swipeDestination(pages, "tasks", -48, 0), "chat")
})

test("vertical and diagonal gestures do not navigate", () => {
  assert.equal(swipeDestination(pages, "tasks", 5, 100), null)
  assert.equal(swipeDestination(pages, "tasks", -80, 80), null)
})

test("navigation stops at each end and moves at most one page", () => {
  assert.equal(swipeDestination(pages, "dashboard", 80, 0), null)
  assert.equal(swipeDestination(pages, "announcements", -80, 0), null)
  assert.equal(swipeDestination(pages, "dashboard", -500, 0), "meetings")
})

test("an unlisted page or empty list cannot jump to an unrelated destination", () => {
  assert.equal(swipeDestination<string>(pages, "notifications", -80, 0), null)
  assert.equal(swipeDestination([], "dashboard", -80, 0), null)
})
