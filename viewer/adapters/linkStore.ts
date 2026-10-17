/** Original, scoped link model backing the unmodified MIT native graph. */
import { reactive, shallowRef, toRaw, watch } from 'vue';
import type { WatchStopHandle } from 'vue';
import { endpointKey, isFloating } from './topologyTypes';
import type { EntityId, GraphScope, LinkTopology } from './topologyTypes';
export type EndpointPatch = Partial<Pick<LinkTopology, 'originNodeId' | 'originSlot' | 'targetNodeId' | 'targetSlot'>>;
export interface EndpointUpdate { topology: LinkTopology; patch: EndpointPatch }
export interface EndpointUpdateError {
  code: 'duplicate-topology' | 'unowned-topology' | 'duplicate-target' | 'occupied-target';
  message: string;
}
type Result<T> = { ok: true; value: T } | { ok: false; error: EndpointUpdateError };
type Entry = { topology: LinkTopology; stop: WatchStopHandle };
type OwnerIndex = { revision: number; all: LinkTopology[]; inputs: Map<string, LinkTopology>; outputs: Map<string, LinkTopology[]> };
type Root = { entries: Map<number, Entry>; indexes: Map<string, OwnerIndex> };

const roots = new Map<string, Root>();
const revision = shallowRef(0);
let batching = 0;
let changed = false;
function bump(): void { if (batching) changed = true; else revision.value++; }
function transaction<T>(operation: () => T): T {
  batching++;
  try { return operation(); }
  finally { if (--batching === 0 && changed) { changed = false; revision.value++; } }
}
function root(id: string): Root {
  let bucket = roots.get(id);
  if (!bucket) roots.set(id, bucket = { entries: new Map(), indexes: new Map() });
  return bucket;
}
function index(scope: GraphScope): OwnerIndex {
  const bucket = roots.get(scope.rootGraphId);
  const cached = bucket?.indexes.get(scope.owningGraphId);
  if (cached?.revision === revision.value) return cached;
  const next: OwnerIndex = { revision: revision.value, all: [], inputs: new Map(), outputs: new Map() };
  for (const entry of bucket?.entries.values() ?? []) {
    const link = entry.topology;
    if (link.graphId !== scope.owningGraphId) continue;
    next.all.push(link);
    // Floating links keep reroute chains alive but never occupy native input/output slots.
    if (isFloating(link)) continue;
    next.inputs.set(endpointKey(link.targetNodeId, link.targetSlot), link);
    const key = endpointKey(link.originNodeId, link.originSlot);
    const links = next.outputs.get(key) ?? [];
    links.push(link); next.outputs.set(key, links);
  }
  next.all.sort((a, b) => a.id - b.id);
  for (const links of next.outputs.values()) links.sort((a, b) => a.id - b.id);
  bucket?.indexes.set(scope.owningGraphId, next);
  return next;
}
function owns(scope: GraphScope, link: LinkTopology): boolean {
  const current = roots.get(scope.rootGraphId)?.entries.get(link.id)?.topology;
  return !!current && current.graphId === scope.owningGraphId && toRaw(current) === toRaw(link);
}
function freeTarget(scope: GraphScope, link: LinkTopology, ignored: Set<number> = new Set()): boolean {
  if (isFloating(link)) return true;
  const occupant = index(scope).inputs.get(endpointKey(link.targetNodeId, link.targetSlot));
  return !occupant || ignored.has(occupant.id);
}
function place(scope: GraphScope, link: LinkTopology): LinkTopology {
  const raw = toRaw(link);
  raw.graphId = scope.owningGraphId;
  const topology = reactive(raw) as LinkTopology;
  const stop = watch(() => [topology.graphId, topology.originNodeId, topology.originSlot,
    topology.targetNodeId, topology.targetSlot, topology.parentId, topology.type], bump, { flush: 'sync' });
  root(scope.rootGraphId).entries.set(link.id, { topology, stop });
  bump(); return topology;
}
function remove(scope: GraphScope, link: LinkTopology): boolean {
  if (!owns(scope, link)) return false;
  const bucket = roots.get(scope.rootGraphId)!;
  bucket.entries.get(link.id)!.stop();
  bucket.entries.delete(link.id);
  bump(); return true;
}
function failure(code: EndpointUpdateError['code'], message: string): { ok: false; error: EndpointUpdateError } {
  return { ok: false, error: { code, message } };
}
function registerLink(scope: GraphScope, topology: LinkTopology): LinkTopology | undefined {
  if (topology.id === -1) return;
  const current = roots.get(scope.rootGraphId)?.entries.get(topology.id)?.topology;
  if (current) return owns(scope, topology) ? current : undefined;
  if (!freeTarget(scope, topology)) return;
  return place(scope, topology);
}
function replaceLink(scope: GraphScope, incumbent: LinkTopology | undefined, replacement: LinkTopology): LinkTopology | undefined {
  if (replacement.id === -1 || (incumbent && !owns(scope, incumbent))) return;
  const existing = roots.get(scope.rootGraphId)?.entries.get(replacement.id)?.topology;
  if (existing && (!incumbent || toRaw(existing) !== toRaw(incumbent))) return;
  if (!freeTarget(scope, replacement, new Set(incumbent ? [incumbent.id] : []))) return;
  if (incumbent && toRaw(incumbent) === toRaw(replacement)) return incumbent;
  return transaction(() => { if (incumbent) remove(scope, incumbent); return place(scope, replacement); });
}
function updateEndpoints(scope: GraphScope, updates: readonly EndpointUpdate[], removals: readonly LinkTopology[] = []): Result<LinkTopology[]> {
  const participants = new Set<number>();
  for (const link of [...updates.map(update => update.topology), ...removals]) {
    if (participants.has(link.id)) return failure('duplicate-topology', `Link ${link.id} occurs more than once`);
    if (!owns(scope, link)) return failure('unowned-topology', `Link ${link.id} is not owned by this graph`);
    participants.add(link.id);
  }
  const targets = new Set<string>();
  const planned = updates.map(({ topology, patch }) => ({ ...topology, ...patch }));
  for (const next of planned) {
    if (isFloating(next)) continue;
    const target = endpointKey(next.targetNodeId, next.targetSlot);
    if (targets.has(target)) return failure('duplicate-target', 'Multiple updated links would occupy the same input');
    if (!freeTarget(scope, next, participants)) return failure('occupied-target', 'An unchanged link occupies the requested input');
    targets.add(target);
  }
  return transaction(() => {
    for (const link of removals) remove(scope, link);
    for (const { topology, patch } of updates) {
      // Write the registered reactive object even if the caller supplied its original raw object.
      const stored = roots.get(scope.rootGraphId)!.entries.get(topology.id)!.topology;
      for (const key of ['originNodeId', 'originSlot', 'targetNodeId', 'targetSlot'] as const) {
        if (Object.prototype.hasOwnProperty.call(patch, key)) (stored as any)[key] = patch[key];
      }
    }
    return { ok: true, value: updates.map(({ topology }) => roots.get(scope.rootGraphId)!.entries.get(topology.id)!.topology) };
  });
}
function updateEndpoint(scope: GraphScope, topology: LinkTopology, patch: EndpointPatch): Result<LinkTopology> {
  const result = updateEndpoints(scope, [{ topology, patch }]);
  return result.ok ? { ok: true, value: result.value[0] } : result;
}
function clearGraph(rootGraphId: string): void {
  const bucket = roots.get(rootGraphId);
  if (!bucket) return;
  for (const entry of bucket.entries.values()) entry.stop();
  roots.delete(rootGraphId); bump();
}
function clearOwner(scope: GraphScope): void {
  transaction(() => { for (const link of index(scope).all) remove(scope, link); });
  roots.get(scope.rootGraphId)?.indexes.delete(scope.owningGraphId);
}
function rekeyOwner(rootGraphId: string, previousId: string, nextId: string): void {
  if (previousId === nextId) return;
  const bucket = roots.get(rootGraphId);
  if (!bucket) return;
  if ([...bucket.entries.values()].some(entry => entry.topology.graphId === nextId)) throw new Error('Destination graph already owns links');
  transaction(() => { for (const entry of bucket.entries.values()) if (entry.topology.graphId === previousId) entry.topology.graphId = nextId; });
  bucket.indexes.clear();
}
function rekeyRoot(previousId: string, nextId: string): void {
  if (previousId === nextId || !roots.has(previousId)) return;
  if (roots.has(nextId)) throw new Error('Destination root already owns links');
  const bucket = roots.get(previousId)!;
  if ([...bucket.entries.values()].some(entry => entry.topology.graphId === nextId)) throw new Error('Destination root owner already owns links');
  transaction(() => {
    roots.delete(previousId); roots.set(nextId, bucket);
    for (const entry of bucket.entries.values()) if (entry.topology.graphId === previousId) entry.topology.graphId = nextId;
    bucket.indexes.clear(); bump();
  });
}
const store = {
  registerLink, replaceLink, deleteLink: remove, updateEndpoint, updateEndpoints,
  getRevision: () => revision.value,
  graphTopologies: (scope: GraphScope): Iterable<LinkTopology> => index(scope).all,
  getTopology: (rootOrScope: string | GraphScope, id: number): LinkTopology | undefined => {
    const scope = typeof rootOrScope === 'string' ? undefined : rootOrScope;
    const value = roots.get(scope?.rootGraphId ?? rootOrScope as string)?.entries.get(id)?.topology;
    return scope && value?.graphId !== scope.owningGraphId ? undefined : value;
  },
  getInputSlotLink: (scope: GraphScope, nodeId: EntityId, slot: number) => index(scope).inputs.get(endpointKey(nodeId, slot)),
  getOutputSlotLinks: (scope: GraphScope, nodeId: EntityId, slot: number): readonly LinkTopology[] => index(scope).outputs.get(endpointKey(nodeId, slot)) ?? [],
  isInputSlotConnected: (scope: GraphScope, nodeId: EntityId, slot: number) => index(scope).inputs.has(endpointKey(nodeId, slot)),
  isOutputSlotConnected: (scope: GraphScope, nodeId: EntityId, slot: number) => index(scope).outputs.has(endpointKey(nodeId, slot)),
  clearGraph, clearOwner, rekeyRoot, rekeyOwner,
  hasGraph: (id: string) => roots.has(id),
  hasOwner: (scope: GraphScope) => index(scope).all.length > 0,
  $reset: () => { for (const id of [...roots.keys()]) clearGraph(id); }
};
export const useLinkStore = () => store;
