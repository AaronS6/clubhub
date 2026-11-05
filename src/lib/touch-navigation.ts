/** A deliberate horizontal swipe moves one page; edges never wrap around. */
export function swipeDestination<T extends string>(
  pages: readonly T[],
  current: T,
  deltaX: number,
  deltaY: number,
): T | null {
  if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY) * 1.5) return null
  const index = pages.indexOf(current)
  if (index < 0) return null
  return pages[index + (deltaX < 0 ? 1 : -1)] ?? null
}
