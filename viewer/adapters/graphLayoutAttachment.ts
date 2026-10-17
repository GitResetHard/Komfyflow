/** Original host geometry bridge for the current native LiteGraph API. */
import { Rectangle } from '../vendor/litegraph/src/infrastructure/Rectangle'
import { createMutationView } from '../vendor/litegraph/src/infrastructure/createMutationView'
import { layoutStore } from './layoutStore'
import type { LayoutPoint, LayoutSize } from './layoutStore'

type Attachment = { root: any; owner: any; id: any; graph: any }
type NodeGeometry = { rect: Rectangle; position: any; size: any; rendered: [number, number]; revision: number; attachment?: Attachment }
const nodes = new WeakMap<object, NodeGeometry>()
const groups = new WeakMap<object, Attachment>()
const reroutes = new WeakMap<object, Attachment>()
const attachedNodes = new Set<object>()
const attachedGroups = new Set<object>()
const attachedReroutes = new Set<object>()
const valid = (n: any) => typeof n === 'number' && Number.isFinite(n)
function owner(graph: any, id: any): Attachment { return { root: graph.rootGraph?.id ?? graph.id, owner: graph.id, graph, id } }
function geometry(node: object): NodeGeometry {
  let state = nodes.get(node)
  if (state) return state
  const rect = new Rectangle(10, 10, 140, 60)
  state = { rect, position: undefined, size: undefined, rendered: [140, 60], revision: -1 }
  nodes.set(node, state)
  state.position = createMutationView(rect.pos, { synchronize: () => refreshNodeGeometry(node), commit: () => commit(node, false), observe: rect })
  state.size = createMutationView(rect.size, { synchronize: () => refreshNodeGeometry(node), commit: () => commit(node, true), observe: rect })
  return state
}
function commit(node: object, resized: boolean) {
  const state = geometry(node)
  const { rect, attachment } = state
  if (![rect[0], rect[1], rect[2], rect[3]].every(valid)) { state.revision = -1; refreshNodeGeometry(node); return }
  rect[2] = Math.max(0, rect[2]); rect[3] = Math.max(0, rect[3])
  if (attachment) {
    if (resized) layoutStore.clearContentSize(attachment.root, attachment.id)
    layoutStore.batchUpdateNodeBounds(attachment.root, [{ nodeId: attachment.id, bounds: { x: rect[0], y: rect[1], width: rect[2], height: rect[3] } }], { source: 'canvas' })
    state.revision = layoutStore.revisionOf(attachment.root)
  }
  state.rendered[0] = rect[2]; state.rendered[1] = rect[3]
}
export function refreshNodeGeometry(node: object): [number, number] {
  const state = geometry(node)
  const { attachment, rect } = state
  if (attachment && state.revision !== layoutStore.revisionOf(attachment.root)) {
    layoutStore.readNodeRect(attachment.root, attachment.id, rect)
    state.revision = layoutStore.revisionOf(attachment.root)
  }
  const measured = attachment ? layoutStore.contentSizeOf(attachment.root, attachment.id) : undefined
  state.rendered[0] = measured?.width ?? rect[2]
  state.rendered[1] = measured?.height ?? rect[3]
  return state.rendered
}
export function nodeGeometryBuffer(node: object): Rectangle { refreshNodeGeometry(node); return geometry(node).rect }
export function nodePositionBuffer(node: object): any { refreshNodeGeometry(node); return geometry(node).rect.pos }
export function nodeSizeBuffer(node: object): any { refreshNodeGeometry(node); return geometry(node).rect.size }
export function nodePositionView(node: object): any { refreshNodeGeometry(node); return geometry(node).position }
export function nodeSizeView(node: object): any { refreshNodeGeometry(node); return geometry(node).size }
export function setNodePosition(node: object, position: ArrayLike<number>) {
  if (!valid(position?.[0]) || !valid(position?.[1])) return
  refreshNodeGeometry(node)
  const { rect } = geometry(node)
  rect[0] = position[0]; rect[1] = position[1]
  commit(node, false)
}
export function setNodeSize(node: object, size: ArrayLike<number>) {
  if (!valid(size?.[0]) || !valid(size?.[1])) return
  refreshNodeGeometry(node)
  const { rect } = geometry(node)
  rect[2] = size[0]; rect[3] = size[1]
  commit(node, true)
}
export function resizeNodeLayout(node: object, size: LayoutSize, options: { position?: LayoutPoint; source?: any } = {}) {
  refreshNodeGeometry(node)
  const state = geometry(node)
  const { rect, attachment } = state
  const position = options.position ?? { x: rect[0], y: rect[1] }
  if (![position.x, position.y, size.width, size.height].every(valid)) return
  rect.set([position.x, position.y, Math.max(0, size.width), Math.max(0, size.height)])
  if (attachment) {
    layoutStore.clearContentSize(attachment.root, attachment.id)
    layoutStore.batchUpdateNodeBounds(attachment.root, [{ nodeId: attachment.id, bounds: { x: rect[0], y: rect[1], width: rect[2], height: rect[3] } }], { source: options.source ?? 'canvas' })
    state.revision = layoutStore.revisionOf(attachment.root)
  }
  state.rendered[0] = rect[2]; state.rendered[1] = rect[3]
}
export function moveNodeLayout(node: object, position: LayoutPoint) { setNodePosition(node, [position.x, position.y]) }
export function attachNodeLayout(graph: any, node: any) {
  const state = geometry(node)
  if (state.attachment) detachNodeLayout(node)
  const a = owner(graph, node.id)
  state.attachment = a
  attachedNodes.add(node)
  if (!layoutStore.getNodeLayout(a.root, a.id)) {
    const [x, y, width, height] = state.rect
    layoutStore.applyOperation({ type: 'createNode', graphId: a.root, nodeId: a.id, layout: { id: a.id, position: { x, y }, size: { width, height }, zIndex: layoutStore.allocateZIndex(), visible: true } })
  }
  layoutStore.setOwner(a.root, 'node', a.id, a.owner)
  state.revision = -1
  refreshNodeGeometry(node)
}
export function detachNodeLayout(node: object, options: { removeLayouts?: boolean } = {}) {
  const state = nodes.get(node)
  if (!state?.attachment) return
  refreshNodeGeometry(node)
  const a = state.attachment
  state.attachment = undefined
  attachedNodes.delete(node)
  state.revision = -1
  if (options.removeLayouts !== false) layoutStore.applyOperation({ type: 'deleteNode', graphId: a.root, nodeId: a.id })
}
export function attachGroupLayout(graph: any, group: any) {
  const a = owner(graph, group.id)
  const position = { x: group.pos[0], y: group.pos[1] }
  const size = { width: group.size[0], height: group.size[1] }
  groups.set(group, a); attachedGroups.add(group)
  if (!layoutStore.getGroupLayout(a.root, a.id)) layoutStore.applyOperation({ type: 'createGroup', graphId: a.root, groupId: a.id, position, size })
  layoutStore.setOwner(a.root, 'group', a.id, a.owner)
  group.syncBoundsFromStore?.()
}
export function setGroupBoundsLayout(group: any, position: LayoutPoint, size: LayoutSize) {
  const a = groups.get(group)
  if (!a || !layoutStore.getGroupLayout(a.root, a.id)) return
  layoutStore.applyOperation({ type: 'setGroupBounds', graphId: a.root, groupId: a.id, position, size })
}
export function detachGroupLayout(group: any, options: { removeLayouts?: boolean } = {}) {
  const a = groups.get(group)
  if (!a) return
  group.syncBoundsFromStore?.()
  groups.delete(group); attachedGroups.delete(group)
  if (options.removeLayouts !== false) layoutStore.applyOperation({ type: 'deleteGroup', graphId: a.root, groupId: a.id })
}
export function materializeRerouteLayout(graph: any, reroute: any) {
  const a = owner(graph, reroute.id)
  const position = { x: reroute.pos[0], y: reroute.pos[1] }
  reroutes.set(reroute, a); attachedReroutes.add(reroute)
  if (!layoutStore.getRerouteLayout(a.root, a.id)) layoutStore.applyOperation({ type: 'createReroute', graphId: a.root, rerouteId: a.id, position })
  layoutStore.setOwner(a.root, 'reroute', a.id, a.owner)
  reroute.syncPosition?.()
}
export function moveRerouteLayout(reroute: object, position: LayoutPoint) {
  const a = reroutes.get(reroute)
  if (a) layoutStore.applyOperation({ type: 'moveReroute', graphId: a.root, rerouteId: a.id, position })
}
export function detachRerouteLayout(reroute: any, options: { removeLayouts?: boolean } = {}) {
  const a = reroutes.get(reroute)
  if (!a) return
  reroute.syncPosition?.()
  reroutes.delete(reroute); attachedReroutes.delete(reroute)
  if (options.removeLayouts !== false) layoutStore.applyOperation({ type: 'deleteReroute', graphId: a.root, rerouteId: a.id })
}
export function detachGraphLayouts(graphs: Iterable<any>, options: { removeLayouts?: boolean } = {}) {
  const targets = new Set(graphs)
  const owns = (a: Attachment | undefined) => a && [...targets].some(graph => a.graph === graph || (graph.isRootGraph && a.root === graph.id))
  // Clear attachment ownership before emitting deletion events to prevent resurrection.
  for (const node of [...attachedNodes]) if (owns(nodes.get(node)?.attachment)) detachNodeLayout(node, options)
  for (const group of [...attachedGroups]) if (owns(groups.get(group))) detachGroupLayout(group, options)
  for (const reroute of [...attachedReroutes]) if (owns(reroutes.get(reroute))) detachRerouteLayout(reroute, options)
}
layoutStore.onRekey((previous, next, root) => {
  // Reroute's native class caches this root ID rather than reading its graph.
  if (root === undefined) for (const reroute of attachedReroutes) {
    if (reroutes.get(reroute)?.root === previous) (reroute as any).rootGraphId = next
  }
  const attachments = [...[...attachedNodes].map(n => nodes.get(n)?.attachment), ...[...attachedGroups].map(g => groups.get(g)), ...[...attachedReroutes].map(r => reroutes.get(r))]
  for (const a of attachments) {
    if (!a) continue
    if (root === undefined && a.root === previous) a.root = next
    if ((root === undefined || a.root === root) && a.owner === previous) a.owner = next
  }
})
