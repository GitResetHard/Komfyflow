import { shallowReactive } from 'vue';
import type { GraphScope } from './topologyTypes';

/** A root owns multiple graph buckets, including independently isolated subgraphs. */
export function scopedTable<T>() {
  const roots = shallowReactive(new Map<string, Map<string, T>>());
  function get(scope: GraphScope): T | undefined { return roots.get(scope.rootGraphId)?.get(scope.owningGraphId); }
  function put(scope: GraphScope, value: T): void {
    let owners = roots.get(scope.rootGraphId);
    if (!owners) roots.set(scope.rootGraphId, owners = shallowReactive(new Map()));
    owners.set(scope.owningGraphId, value);
  }
  function ensure(scope: GraphScope, make: () => T): T {
    const current = get(scope);
    if (current !== undefined) return current;
    const value = make(); put(scope, value); return value;
  }
  function clearOwner(scope: GraphScope): void {
    const owners = roots.get(scope.rootGraphId);
    owners?.delete(scope.owningGraphId);
    if (owners?.size === 0) roots.delete(scope.rootGraphId);
  }
  function rekeyOwner(rootGraphId: string, previousId: string, nextId: string): void {
    if (previousId === nextId) return;
    const owners = roots.get(rootGraphId);
    if (!owners?.has(previousId)) return;
    if (owners.has(nextId)) throw new Error(`Graph owner ${nextId} already exists`);
    const value = owners.get(previousId)!;
    owners.delete(previousId); owners.set(nextId, value);
  }
  function rekeyRoot(previousId: string, nextId: string): void {
    if (previousId === nextId || !roots.has(previousId)) return;
    if (roots.has(nextId)) throw new Error(`Graph root ${nextId} already exists`);
    const owners = roots.get(previousId)!;
    if (owners.has(previousId) && owners.has(nextId)) throw new Error(`Graph owner ${nextId} already exists`);
    roots.delete(previousId); roots.set(nextId, owners);
    rekeyOwner(nextId, previousId, nextId);
  }
  return { roots, get, put, ensure, clearOwner, rekeyOwner, rekeyRoot,
    hasGraph: (id: string) => roots.has(id),
    hasOwner: (scope: GraphScope) => roots.get(scope.rootGraphId)?.has(scope.owningGraphId) ?? false,
    clearGraph: (id: string) => { roots.delete(id); },
    clearAll: () => roots.clear()
  };
}
