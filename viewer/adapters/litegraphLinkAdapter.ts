/**
 * Original Komfyflow connection renderer, not copied from the ComfyUI host.
 * Native LGraphCanvas still resolves endpoints, topology, reroute chains,
 * visibility and drawing order. This bridge draws the requested segment only.
 */
import { LinkDirection, LinkMarkerShape, LinkRenderType } from '../vendor/litegraph/src/types/globalEnums'
import { slotTypeKey } from '../vendor/litegraph/src/utils/type'
import { setLinkPolyline, deleteLinkPolyline } from './linkPolylines'
import { layoutStore } from './layoutStore'
import type { PolylinePoint } from './linkPolylines'

export interface LinkRenderContext {
  renderMode: number
  connectionWidth: number
  renderBorder: boolean
  lowQuality: boolean
  highQualityRender: boolean
  scale: number
  linkMarkerShape: number
  renderConnectionArrows: boolean
  highlightedLinks: Set<any>
  defaultLinkColor: string
  linkTypeColors: Record<string | number, string>
  disabledPattern?: CanvasPattern | null
}
type Pair = Readonly<ArrayLike<number>>
export interface ConnectionOptions {
  startControl?: Pair
  endControl?: Pair
  reroute?: any
  num_sublines?: number
  disabled?: boolean
}
export interface ConnectionGeometry {
  points: PolylinePoint[]
  control1?: PolylinePoint
  control2?: PolylinePoint
  curved: boolean
}
const point = (x: number, y: number): PolylinePoint => ({ x, y })
const midpoint = (a: PolylinePoint, b: PolylinePoint) => point((a.x + b.x) / 2, (a.y + b.y) / 2)
function directionVector(direction: number, amount: number): PolylinePoint {
  switch (direction) {
    case LinkDirection.UP: return point(0, -amount)
    case LinkDirection.DOWN: return point(0, amount)
    case LinkDirection.LEFT: return point(-amount, 0)
    case LinkDirection.RIGHT: return point(amount, 0)
    default: return point(0, 0)
  }
}
function control(origin: PolylinePoint, direction: number, amount: number, explicit?: Pair) {
  const offset = explicit ? point(explicit[0], explicit[1]) : directionVector(direction, amount)
  return point(origin.x + offset.x, origin.y + offset.y)
}
function distanceToLine(p: PolylinePoint, a: PolylinePoint, b: PolylinePoint): number {
  const dx = b.x - a.x, dy = b.y - a.y
  const length = Math.hypot(dx, dy)
  return length ? Math.abs(dy * p.x - dx * p.y + b.x * a.y - b.y * a.x) / length : Math.hypot(p.x - a.x, p.y - a.y)
}
function flattenBezier(a: PolylinePoint, c1: PolylinePoint, c2: PolylinePoint, b: PolylinePoint, tolerance: number, points: PolylinePoint[], depth = 0) {
  const chord = Math.hypot(b.x - a.x, b.y - a.y)
  const polygon = Math.hypot(c1.x - a.x, c1.y - a.y) + Math.hypot(c2.x - c1.x, c2.y - c1.y) + Math.hypot(b.x - c2.x, b.y - c2.y)
  if (depth >= 12 || (Math.max(distanceToLine(c1, a, b), distanceToLine(c2, a, b)) <= tolerance && polygon - chord <= tolerance)) { points.push(b); return }
  const p01 = midpoint(a, c1), p12 = midpoint(c1, c2), p23 = midpoint(c2, b)
  const p012 = midpoint(p01, p12), p123 = midpoint(p12, p23), p = midpoint(p012, p123)
  flattenBezier(a, p01, p012, p, tolerance, points, depth + 1)
  flattenBezier(p, p123, p23, b, tolerance, points, depth + 1)
}
/** Pure geometry is exported so link paths can be tested without a browser. */
export function buildConnectionGeometry(a: Pair, b: Pair, startDirection: number, endDirection: number, renderMode: number, options: ConnectionOptions = {}, scale = 1): ConnectionGeometry {
  const start = point(a[0], a[1]), end = point(b[0], b[1])
  const distance = Math.hypot(end.x - start.x, end.y - start.y)
  const offset = Math.max(20, distance * 0.25)
  const c1 = control(start, startDirection, offset, options.startControl)
  const c2 = control(end, endDirection, offset, options.endControl)
  if (renderMode === LinkRenderType.SPLINE_LINK) {
    const points = [start]
    flattenBezier(start, c1, c2, end, Math.max(0.15, 0.7 / Math.max(0.05, scale)), points)
    return { points, control1: c1, control2: c2, curved: true }
  }
  const lead = Math.min(20, distance / 4)
  const first = control(start, startDirection, lead, options.startControl)
  const last = control(end, endDirection, lead, options.endControl)
  const points = [start, first]
  if (renderMode === LinkRenderType.LINEAR_LINK) {
    const horizontalStart = Math.abs(first.x - start.x) >= Math.abs(first.y - start.y)
    const horizontalEnd = Math.abs(last.x - end.x) >= Math.abs(last.y - end.y)
    if (horizontalStart && horizontalEnd) {
      const middleX = (first.x + last.x) / 2
      points.push(point(middleX, first.y), point(middleX, last.y))
    } else if (!horizontalStart && !horizontalEnd) {
      const middleY = (first.y + last.y) / 2
      points.push(point(first.x, middleY), point(last.x, middleY))
    } else if (horizontalStart) points.push(point(last.x, first.y))
    else points.push(point(first.x, last.y))
  }
  points.push(last, end)
  return { points: points.filter((p, i, all) => !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y), curved: false }
}
function createPath(geometry: ConnectionGeometry): Path2D {
  const path = new Path2D()
  const start = geometry.points[0], end = geometry.points.at(-1)!
  path.moveTo(start.x, start.y)
  if (geometry.curved) path.bezierCurveTo(geometry.control1!.x, geometry.control1!.y, geometry.control2!.x, geometry.control2!.y, end.x, end.y)
  else for (const p of geometry.points.slice(1)) path.lineTo(p.x, p.y)
  return path
}
export function pointAlongPolyline(points: readonly PolylinePoint[], fraction: number): PolylinePoint & { angle: number } {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y))
  let remaining = lengths.reduce((sum, length) => sum + length, 0) * Math.max(0, Math.min(1, fraction))
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i], b = points[i + 1], length = lengths[i]
    if (remaining <= length || i === lengths.length - 1) {
      const t = length ? remaining / length : 0
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) }
    }
    remaining -= length
  }
  return { ...(points[0] ?? point(0, 0)), angle: 0 }
}
function drawArrow(ctx: CanvasRenderingContext2D, at: PolylinePoint & { angle: number }, size: number) {
  ctx.save()
  ctx.translate(at.x, at.y)
  ctx.rotate(at.angle)
  ctx.beginPath()
  ctx.moveTo(size, 0)
  ctx.lineTo(-size * 0.7, -size * 0.6)
  ctx.lineTo(-size * 0.7, size * 0.6)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}
function colorFor(link: any, color: any, context: LinkRenderContext): any {
  if (link && (context.highlightedLinks.has(link.id) || context.highlightedLinks.has(String(link.id)))) return '#ffffff'
  return color ?? link?.color ?? (link ? context.linkTypeColors[slotTypeKey(link.type)] : undefined) ?? context.defaultLinkColor ?? '#9aa4b2'
}
export class LitegraphLinkAdapter {
  constructor(_useLayoutTree = false) {}
  renderDraggingLink(ctx: CanvasRenderingContext2D, from: Pair, to: Pair, color: any, fromDirection: number, dragDirection: number, context: LinkRenderContext): void {
    this.renderLinkDirect(ctx, from, to, null, false, 0, color, fromDirection, dragDirection, context)
  }
  renderLinkDirect(ctx: CanvasRenderingContext2D, a: Pair, b: Pair, link: any, skipBorder: boolean, flow: number | null, color: any, startDirection: number, endDirection: number, context: LinkRenderContext, options: ConnectionOptions = {}): void {
    const segment = options.reroute ?? link
    if (context.renderMode === LinkRenderType.HIDDEN_LINK) {
      if (segment) { segment.path = undefined; deleteLinkPolyline(segment); layoutStore.deleteLinkLayout(segment) }
      return
    }
    if (![a[0], a[1], b[0], b[1]].every(Number.isFinite)) return
    const geometry = buildConnectionGeometry(a, b, startDirection ?? LinkDirection.RIGHT, endDirection ?? LinkDirection.LEFT, context.renderMode, options, context.scale)
    const path = createPath(geometry)
    const center = pointAlongPolyline(geometry.points, 0.5)
    if (segment) {
      segment.path = path
      segment._pos ??= [0, 0]
      segment._pos[0] = center.x; segment._pos[1] = center.y
      segment._centreAngle = center.angle
      setLinkPolyline(segment, geometry.points)
      layoutStore.setLinkLayout(segment, { graphId: link?._graphScope?.rootGraphId, linkId: link?.id, rerouteId: options.reroute?.id, path, points: geometry.points })
    }
    ctx.save()
    try {
      const width = Math.max(0.25, context.connectionWidth || 2)
      const stroke = colorFor(link, color, context)
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      const sublines = Math.max(1, Math.min(32, Math.floor(options.num_sublines ?? 1)))
      for (let line = 0; line < sublines; line++) {
        ctx.save()
        if (sublines > 1) ctx.translate(0, (line - (sublines - 1) / 2) * (width + 2))
        if (options.disabled) ctx.setLineDash([5, 4])
        if (context.renderBorder && !skipBorder && !context.lowQuality && context.scale > 0.2) {
          ctx.lineWidth = width + 2
          ctx.strokeStyle = 'rgba(0,0,0,0.45)'
          ctx.stroke(path)
        }
        ctx.lineWidth = width
        ctx.strokeStyle = options.disabled && context.disabledPattern ? context.disabledPattern : stroke
        ctx.stroke(path)
        ctx.restore()
      }
      ctx.fillStyle = stroke
      if (!context.lowQuality && context.scale > 0.25) {
        if (context.linkMarkerShape === LinkMarkerShape.Circle) {
          ctx.beginPath(); ctx.arc(center.x, center.y, Math.max(2, width * 1.35), 0, Math.PI * 2); ctx.fill()
        } else if (context.linkMarkerShape === LinkMarkerShape.Arrow) drawArrow(ctx, center, Math.max(4, width * 2))
        if (context.renderConnectionArrows) {
          drawArrow(ctx, pointAlongPolyline(geometry.points, 0.25), Math.max(4, width * 2))
          drawArrow(ctx, pointAlongPolyline(geometry.points, 0.75), Math.max(4, width * 2))
        }
      }
      if (flow && flow > 0) {
        const phase = ((typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1400) % 1
        ctx.fillStyle = '#ffffff'
        for (let i = 0; i < 5; i++) {
          const at = pointAlongPolyline(geometry.points, (phase + i / 5) % 1)
          ctx.beginPath(); ctx.arc(at.x, at.y, 2 + Math.min(1, flow) * 2, 0, Math.PI * 2); ctx.fill()
        }
      }
    } finally { ctx.restore() }
  }
}
