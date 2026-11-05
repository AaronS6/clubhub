/** Continuous position of a finger across equal-width navigation buttons. */
export function tabPosition(clientX: number, left: number, width: number, count: number): number {
  if (width <= 0 || count < 1) return 0
  return Math.max(0, Math.min(count - 1, ((clientX - left) / width) * count - 0.5))
}

/** Snap a deliberate horizontal drag to the button under the finger. */
export function draggedTabIndex(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  left: number,
  width: number,
  count: number,
): number | null {
  const dx = endX - startX
  const dy = endY - startY
  if (width <= 0 || count < 1 || Math.abs(dx) < 16 || Math.abs(dx) < Math.abs(dy) * 1.5) return null
  return Math.round(tabPosition(endX, left, width, count))
}
