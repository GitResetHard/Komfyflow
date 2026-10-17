/** Original reroute-chain storage and cycle-safe, derived link membership. */
import { reactive, shallowRef, toRaw, watch } from 'vue';
import type { WatchStopHandle } from 'vue';
import { useLinkStore } from './linkStore';
import { isFloating, scopeKey } from './topologyTypes';
import type { GraphScope, RerouteChain } from './topologyTypes';
export interface RerouteMembership { readonly linkIds: ReadonlySet<number>; readonly floatingLinkIds: ReadonlySet<number> }
export const EMPTY_MEMBERSHIP: RerouteMembership = Object.freeze({ linkIds: new Set<number>(), floatingLinkIds: new Set<number>() });
type Entry = { chain: RerouteChain; stop: WatchStopHandle };
type MembershipCache = { linksRevision: number; reroutesRevision: number; entries: Map<number, RerouteMembership> };
const roots = new Map<string, Map<number, Entry>>();
const caches = new Map<string, MembershipCache>();
const revision = shallowRef(0);
const bump = () => { revision.value++; caches.clear(); };
function getReroute(scope: GraphScope, id: number): RerouteChain | undefined {
  revision.value;
  const chain = roots.get(scope.rootGraphId)?.get(id)?.chain;
  return chain?.graphId === scope.owningGraphId ? chain : undefined;
}
function graphChains(scope: GraphScope): RerouteChain[] {
  revision.value;
  return [...(roots.get(scope.rootGraphId)?.values() ?? [])].map(entry => entry.chain)
    .filter(chain => chain.graphId === scope.owningGraphId).sort((a, b) => a.id - b.id);
}
function registerReroute(scope: GraphScope, value: RerouteChain): RerouteChain | undefined {
  let bucket = roots.get(scope.rootGraphId);
  const incumbent = bucket?.get(value.id)?.chain;
  if (incumbent) return incumbent.graphId === scope.owningGraphId && toRaw(incumbent) === toRaw(value) ? incumbent : undefined;
  if (!bucket) roots.set(scope.rootGraphId, bucket = new Map());
  const raw = toRaw(value); raw.graphId = scope.owningGraphId;
  const chain = reactive(raw) as RerouteChain;
  const stop = watch(() => [chain.graphId, chain.parentId, chain.floating?.slotType], bump, { flush: 'sync' });
  bucket.set(chain.id, { chain, stop }); bump(); return chain;
}
function deleteReroute(scope: GraphScope, value: RerouteChain): boolean {
  const chain = getReroute(scope, value.id);
  if (!chain || toRaw(chain) !== toRaw(value)) return false;
  const bucket = roots.get(scope.rootGraphId)!;
  bucket.get(value.id)!.stop(); bucket.delete(value.id); bump(); return true;
}
function getMembership(scope: GraphScope, id: number): RerouteMembership {
  const links = useLinkStore();
  const key = scopeKey(scope);
  let cache = caches.get(key);
  if (!cache || cache.linksRevision !== links.getRevision() || cache.reroutesRevision !== revision.value) {
    const entries = new Map<number, { linkIds: Set<number>; floatingLinkIds: Set<number> }>();
    for (const chain of graphChains(scope)) entries.set(chain.id, { linkIds: new Set(), floatingLinkIds: new Set() });
    for (const link of links.graphTopologies(scope)) {
      let cursor = link.parentId;
      const visited = new Set<number>();
      while (cursor !== undefined && !visited.has(cursor)) {
        visited.add(cursor);
        const chain = getReroute(scope, cursor);
        if (!chain) break;
        const membership = entries.get(cursor)!;
        (isFloating(link) ? membership.floatingLinkIds : membership.linkIds).add(link.id);
        cursor = chain.parentId;
      }
    }
    cache = { linksRevision: links.getRevision(), reroutesRevision: revision.value, entries };
    caches.set(key, cache);
  }
  return cache.entries.get(id) ?? EMPTY_MEMBERSHIP;
}
function clearGraph(rootGraphId: string): void {
  const bucket = roots.get(rootGraphId);
  if (!bucket) return;
  for (const entry of bucket.values()) entry.stop();
  roots.delete(rootGraphId); bump();
}
function clearOwner(scope: GraphScope): void { for (const chain of graphChains(scope)) deleteReroute(scope, chain); }
function rekeyOwner(rootGraphId: string, previousId: string, nextId: string): void {
  if (previousId === nextId) return;
  const bucket = roots.get(rootGraphId);
  if (!bucket) return;
  if ([...bucket.values()].some(entry => entry.chain.graphId === nextId)) throw new Error('Destination owner already owns reroutes');
  for (const entry of bucket.values()) if (entry.chain.graphId === previousId) entry.chain.graphId = nextId;
}
function rekeyRoot(previousId: string, nextId: string): void {
  if (previousId === nextId || !roots.has(previousId)) return;
  if (roots.has(nextId)) throw new Error('Destination root already owns reroutes');
  const bucket = roots.get(previousId)!;
  if ([...bucket.values()].some(entry => entry.chain.graphId === nextId)) throw new Error('Destination owner already owns reroutes');
  roots.delete(previousId); roots.set(nextId, bucket);
  for (const entry of bucket.values()) if (entry.chain.graphId === previousId) entry.chain.graphId = nextId;
  bump();
}
const store = { registerReroute, deleteReroute, getReroute, graphChains, getMembership, clearGraph, clearOwner,
  rekeyRoot, rekeyOwner, getRevision: () => revision.value,
  hasGraph: (id: string) => roots.has(id), hasOwner: (scope: GraphScope) => graphChains(scope).length > 0,
  $reset: () => { for (const id of [...roots.keys()]) clearGraph(id); }
};
export const useRerouteStore = () => store;
