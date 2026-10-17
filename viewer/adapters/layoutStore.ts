/** Original Komfyflow host bridge. Geometry is scoped to a root workflow. */
export interface LayoutPoint { x: number; y: number }
export interface LayoutSize { width: number; height: number }
export interface LayoutBounds extends LayoutPoint, LayoutSize {}
export interface NodeLayout { id: any; position: LayoutPoint; size: LayoutSize; bounds: LayoutBounds; zIndex: number; visible: boolean; [key: string]: any }
type ShapeLayout = { id: any; position: LayoutPoint; size?: LayoutSize; [key: string]: any }
type Scope = { nodes: Map<any, NodeLayout>; groups: Map<any, ShapeLayout>; reroutes: Map<any, ShapeLayout>; content: Map<any, LayoutSize>; owners: Map<string, any>; revision: number }
const scopes = new Map<any, Scope>()
const links = new Map<any, any>()
const listeners = new Set<(event: any) => void>()
const rekeyListeners = new Set<(previous: any, next: any, owner?: any) => void>()
let revision = 0
let zIndex = 0
const finite = (n: unknown, fallback = 0): number => typeof n === 'number' && Number.isFinite(n) ? n : fallback
const ownerKey = (kind: string, id: any) => `${kind}:${typeof id}:${String(id)}`
function scope(id: any): Scope {
  let s = scopes.get(id)
  if (!s) scopes.set(id, s = { nodes: new Map(), groups: new Map(), reroutes: new Map(), content: new Map(), owners: new Map(), revision: 0 })
  return s
}
function changed(graphId: any, kind: string, id?: any) {
  const s = scopes.get(graphId)
  if (s) s.revision++
  revision++
  for (const listener of [...listeners]) {
    try { listener({ graphId, type: kind, id, revision }) } catch (error) { console.warn('Geometry listener failed', error) }
  }
}
function normalizeNode(id: any, input: any): NodeLayout {
  const position = { x: finite(input.position?.x ?? input.bounds?.x), y: finite(input.position?.y ?? input.bounds?.y) }
  const size = { width: Math.max(0, finite(input.size?.width ?? input.bounds?.width, 140)), height: Math.max(0, finite(input.size?.height ?? input.bounds?.height, 60)) }
  const order = typeof input.zIndex === 'number' && Number.isFinite(input.zIndex) ? input.zIndex : ++zIndex
  zIndex = Math.max(zIndex, order)
  return { ...input, id, position, size, bounds: { ...position, ...size }, zIndex: order, visible: input.visible !== false }
}
function writeBounds(graphId: any, id: any, bounds: Partial<LayoutBounds>, clearContent = false) {
  const s = scope(graphId)
  const old = s.nodes.get(id)
  if (!old) return false
  const p = { x: finite(bounds.x, old.position.x), y: finite(bounds.y, old.position.y) }
  const size = { width: Math.max(0, finite(bounds.width, old.size.width)), height: Math.max(0, finite(bounds.height, old.size.height)) }
  if (p.x === old.position.x && p.y === old.position.y && size.width === old.size.width && size.height === old.size.height && !(clearContent && s.content.has(id))) return false
  s.nodes.set(id, { ...old, position: p, size, bounds: { ...p, ...size } })
  if (clearContent) s.content.delete(id)
  return true
}
export const layoutStore = {
  isDraggingVueNodes: { value: false },
  get revision() { return revision },
  get geometryRevision() { return revision },
  revisionOf(graphId: any) { return scopes.get(graphId)?.revision ?? -1 },
  allocateZIndex() { return ++zIndex },
  getNodeLayout(graphId: any, id: any) { return scopes.get(graphId)?.nodes.get(id) ?? null },
  getNodeLayoutRef(graphId: any, id: any) { return { get value() { return layoutStore.getNodeLayout(graphId, id) } } },
  getGroupLayout(graphId: any, id: any) { return scopes.get(graphId)?.groups.get(id) ?? null },
  getRerouteLayout(graphId: any, id: any) { return scopes.get(graphId)?.reroutes.get(id) ?? null },
  getAllNodes(graphId: any) { return [...(scopes.get(graphId)?.nodes.values() ?? [])] },
  getAllGroups(graphId: any) { return [...(scopes.get(graphId)?.groups.values() ?? [])] },
  getAllReroutes(graphId: any) { return [...(scopes.get(graphId)?.reroutes.values() ?? [])] },
  hasGraph(graphId: any) { return scopes.has(graphId) },
  hasOwner(graphId: any, ownerId: any) { return [...(scopes.get(graphId)?.owners.values() ?? [])].includes(ownerId) },
  setOwner(graphId: any, kind: string, id: any, ownerId: any) { scope(graphId).owners.set(ownerKey(kind, id), ownerId) },
  ownerOf(graphId: any, kind: string, id: any) { return scopes.get(graphId)?.owners.get(ownerKey(kind, id)) },
  readNodeRect(graphId: any, id: any, target?: any) {
    const node = this.getNodeLayout(graphId, id)
    if (!node) return null
    const rect = target ?? [0, 0, 0, 0]
    rect[0] = node.position.x; rect[1] = node.position.y; rect[2] = node.size.width; rect[3] = node.size.height
    return rect
  },
  contentSizeOf(graphId: any, id: any) { return scopes.get(graphId)?.content.get(id) },
  reportContentSize(graphId: any, id: any, size: LayoutSize) {
    scope(graphId).content.set(id, { width: Math.max(0, finite(size.width)), height: Math.max(0, finite(size.height)) })
    changed(graphId, 'content', id)
  },
  clearContentSize(graphId: any, id: any) { if (scopes.get(graphId)?.content.delete(id)) changed(graphId, 'content', id) },
  batchUpdateNodeBounds(graphId: any, updates: any[], options: any = {}) {
    let count = 0
    for (const { nodeId, bounds } of updates) if (writeBounds(graphId, nodeId, bounds, options.clearContentSize === true)) count++
    if (count) changed(graphId, 'bounds')
  },
  applyOperation(op: any) {
    const { graphId, type } = op
    const s = scope(graphId)
    const id = op.nodeId ?? op.groupId ?? op.rerouteId ?? op.layout?.id
    switch (type) {
      case 'createNode': s.nodes.set(id, normalizeNode(id, op.layout ?? op)); break
      case 'deleteNode': s.nodes.delete(id); s.content.delete(id); s.owners.delete(ownerKey('node', id)); break
      case 'moveNode': writeBounds(graphId, id, op.position ?? op); break
      case 'resizeNode': writeBounds(graphId, id, { ...op.position, ...op.size }, true); break
      case 'setNodeBounds': writeBounds(graphId, id, op.bounds ?? { ...op.position, ...op.size }); break
      case 'setNodeZIndex': {
        const node = s.nodes.get(id)
        if (node) { node.zIndex = finite(op.zIndex); zIndex = Math.max(zIndex, node.zIndex) }
        break
      }
      case 'createGroup':
      case 'setGroupBounds': {
        const old = s.groups.get(id)
        const input = op.layout ?? op
        s.groups.set(id, { id, position: { x: finite(input.position?.x, old?.position.x), y: finite(input.position?.y, old?.position.y) }, size: { width: Math.max(0, finite(input.size?.width, old?.size?.width)), height: Math.max(0, finite(input.size?.height, old?.size?.height)) } })
        break
      }
      case 'deleteGroup': s.groups.delete(id); s.owners.delete(ownerKey('group', id)); break
      case 'createReroute':
      case 'moveReroute': {
        const input = op.layout ?? op
        if (type === 'moveReroute' && !s.reroutes.has(id)) return
        s.reroutes.set(id, { id, position: { x: finite(input.position?.x), y: finite(input.position?.y) } })
        break
      }
      case 'deleteReroute': s.reroutes.delete(id); s.owners.delete(ownerKey('reroute', id)); break
      default: throw new Error(`Unsupported geometry operation: ${String(type)}`)
    }
    changed(graphId, type, id)
  },
  clearGraph(graphId: any) {
    scopes.delete(graphId)
    for (const [id, link] of links) if (link.graphId === graphId) links.delete(id)
    changed(graphId, 'clear')
  },
  rekeyRoot(previous: any, next: any) {
    if (previous === next) return
    const old = scopes.get(previous)
    if (old) {
      scopes.delete(previous); scopes.set(next, old)
      for (const [key, owner] of old.owners) if (owner === previous) old.owners.set(key, next)
    }
    for (const record of links.values()) if (record.graphId === previous) record.graphId = next
    for (const listener of rekeyListeners) listener(previous, next)
    changed(next, 'rekeyRoot')
  },
  rekeyOwner(rootGraphId: any, previous: any, next: any) {
    const s = scopes.get(rootGraphId)
    if (s) for (const [key, owner] of s.owners) if (owner === previous) s.owners.set(key, next)
    for (const listener of rekeyListeners) listener(previous, next, rootGraphId)
    changed(rootGraphId, 'rekeyOwner')
  },
  onRekey(listener: (previous: any, next: any, owner?: any) => void) { rekeyListeners.add(listener); return () => rekeyListeners.delete(listener) },
  onGeometryChange(listener: (event: any) => void) { listeners.add(listener); return () => listeners.delete(listener) },
  setLinkLayout(id: any, layout: any) { links.set(id, layout) },
  getLinkLayout(id: any) { return links.get(id) ?? null },
  deleteLinkLayout(id: any) {
    links.delete(id)
    for (const [key, value] of links) if (value.linkId === id) links.delete(key)
  },
  queryRerouteAtPoint(graphId: any, point: LayoutPoint, radius = 12) {
    for (const item of this.getAllReroutes(graphId).reverse()) if (Math.hypot(item.position.x - point.x, item.position.y - point.y) <= radius) return item
    return null
  },
  queryLinkSegmentAtPoint(point: LayoutPoint, ctx?: CanvasRenderingContext2D, dpr = 1) {
    for (const item of [...links.values()].reverse()) {
      if (item.path && ctx?.isPointInStroke(item.path, point.x * dpr, point.y * dpr)) return item
    }
    return null
  },
  resetForTests() { scopes.clear(); links.clear(); listeners.clear(); revision++; zIndex = 0; this.isDraggingVueNodes.value = false }
}
