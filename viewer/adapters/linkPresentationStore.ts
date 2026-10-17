/** Original presentation state, deliberately independent from topology ownership. */
import { shallowReactive, shallowRef } from 'vue';
import { scopedTable } from './topologyTable';
import type { GraphScope, LinkPresentation } from './topologyTypes';
const table = scopedTable<Map<number, Readonly<LinkPresentation>>>();
const revision = shallowRef(0);
function getPresentation(scope: GraphScope, id: number): Readonly<LinkPresentation> | undefined {
  return table.get(scope)?.get(id);
}
function patch(scope: GraphScope, id: number, update: LinkPresentation): void {
  const before = getPresentation(scope, id);
  const next = { ...before, ...update };
  // Default values do not need a record; setting undefined intentionally clears a label.
  const normalized: LinkPresentation = {};
  if (next.hidden === true) normalized.hidden = true;
  if (typeof next.label === 'string' && next.label.length > 0) normalized.label = next.label;
  if (before?.hidden === normalized.hidden && before?.label === normalized.label) return;
  if (Object.keys(normalized).length) table.ensure(scope, () => shallowReactive(new Map())).set(id, Object.freeze(normalized));
  else table.get(scope)?.delete(id);
  revision.value++;
}
function take(scope: GraphScope, id: number): Readonly<LinkPresentation> | undefined {
  const value = getPresentation(scope, id);
  if (table.get(scope)?.delete(id)) revision.value++;
  return value;
}
function graphHiddenLinkIds(scope: GraphScope): number[] {
  return [...(table.get(scope)?.entries() ?? [])].filter(([, value]) => value.hidden === true).map(([id]) => id).sort((a, b) => a - b);
}
const store = { patch, take, getPresentation, graphHiddenLinkIds,
  getRevision: () => revision.value,
  clearGraph: (id: string) => { table.clearGraph(id); revision.value++; },
  clearOwner: (scope: GraphScope) => { table.clearOwner(scope); revision.value++; },
  rekeyRoot: (previousId: string, nextId: string) => { table.rekeyRoot(previousId, nextId); revision.value++; },
  rekeyOwner: (rootId: string, previousId: string, nextId: string) => { table.rekeyOwner(rootId, previousId, nextId); revision.value++; },
  hasGraph: table.hasGraph, hasOwner: table.hasOwner,
  $reset: () => { table.clearAll(); revision.value++; }
};
export const useLinkPresentationStore = () => store;
