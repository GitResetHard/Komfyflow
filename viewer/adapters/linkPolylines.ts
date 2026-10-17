/** Weak-keyed geometry cache follows lifetime of native link segments. */
export interface PolylinePoint { x: number; y: number }
const polylines = new WeakMap<object, readonly PolylinePoint[]>()
export function setLinkPolyline(segment: object, points: readonly PolylinePoint[]): void { polylines.set(segment, points.map(point => ({ x: point.x, y: point.y }))) }
export function getLinkPolyline(segment: object): readonly PolylinePoint[] | undefined { return polylines.get(segment) }
export function deleteLinkPolyline(segment: object): void { polylines.delete(segment) }
