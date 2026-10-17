/** Original bounds intersection helpers for native link marquee selection. */
type Point = { x: number; y: number }
type Bounds = Point & { width: number; height: number }
function edges(bounds: Bounds) { return { left: Math.min(bounds.x, bounds.x + bounds.width), right: Math.max(bounds.x, bounds.x + bounds.width), top: Math.min(bounds.y, bounds.y + bounds.height), bottom: Math.max(bounds.y, bounds.y + bounds.height) } }
export function pointInBounds(point: Point, bounds: Bounds): boolean { const r = edges(bounds); return point.x >= r.left && point.x <= r.right && point.y >= r.top && point.y <= r.bottom }
export function segmentIntersectsBounds(start: Point, end: Point, bounds: Bounds): boolean {
  const r = edges(bounds)
  let from = 0, to = 1
  const dx = end.x - start.x, dy = end.y - start.y
  const p = [-dx, dx, -dy, dy]
  const q = [start.x - r.left, r.right - start.x, start.y - r.top, r.bottom - start.y]
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue }
    const ratio = q[i] / p[i]
    if (p[i] < 0) from = Math.max(from, ratio)
    else to = Math.min(to, ratio)
    if (from > to) return false
  }
  return true
}
export function polylineIntersectsBounds(points: readonly Point[], bounds: Bounds): boolean {
  if (points.length === 1) return pointInBounds(points[0], bounds)
  for (let i = 1; i < points.length; i++) if (segmentIntersectsBounds(points[i - 1], points[i], bounds)) return true
  return false
}
