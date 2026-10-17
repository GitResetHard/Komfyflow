/** Original execution ordering state, isolated by workflow and subgraph owner. */
import { shallowReactive } from 'vue';
import { scopedTable } from './topologyTable';
import type { EntityId, GraphScope } from './topologyTypes';
const table = scopedTable<Map<string, number>>();
const orders = (scope: GraphScope) => table.ensure(scope, () => shallowReactive(new Map()));
const store = {
  get: (scope: GraphScope, nodeId: EntityId) => table.get(scope)?.get(String(nodeId)),
  set: (scope: GraphScope, nodeId: EntityId, order: number) => { orders(scope).set(String(nodeId), order); },
  replace: (scope: GraphScope, ids: readonly EntityId[]) => {
    const values = shallowReactive(new Map<string, number>());
    ids.forEach((id, order) => values.set(String(id), order)); table.put(scope, values);
  },
  remove: (scope: GraphScope, nodeId: EntityId) => { table.get(scope)?.delete(String(nodeId)); },
  clearGraph: table.clearOwner, clearOwner: table.clearOwner, clearRoot: table.clearGraph,
  rekeyRoot: table.rekeyRoot, rekeyOwner: table.rekeyOwner,
  hasGraph: table.hasGraph, hasOwner: table.hasOwner, $reset: table.clearAll
};
export const useExecutionOrderStore = () => store;
