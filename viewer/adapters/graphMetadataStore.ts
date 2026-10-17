/** Original graph metadata storage. References remain stable until explicitly cleared. */
import { shallowReactive } from 'vue';
import { scopedTable } from './topologyTable';
export interface GraphMetadata { revision: number; config: Record<string, any>; extra: Record<string, any> }
const table = scopedTable<GraphMetadata>();
const scope = (rootGraphId: string, owningGraphId: string = rootGraphId) => ({ rootGraphId, owningGraphId });
function get(rootGraphId: string, graphId: string = rootGraphId): GraphMetadata {
  return table.ensure(scope(rootGraphId, graphId), () => shallowReactive({ revision: 0, config: {}, extra: {} }));
}
const store = { get,
  has: (rootId: string, graphId: string = rootId) => table.hasOwner(scope(rootId, graphId)),
  hasRoot: table.hasGraph, hasGraph: table.hasGraph, hasOwner: table.hasOwner,
  clear: (rootId: string, graphId?: string) => { if (graphId === undefined) table.clearGraph(rootId); else table.clearOwner(scope(rootId, graphId)); },
  clearGraph: table.clearGraph, clearOwner: table.clearOwner,
  rekeyRoot: table.rekeyRoot, rekeyGraph: table.rekeyOwner, rekeyOwner: table.rekeyOwner,
  $reset: table.clearAll
};
export const useGraphMetadataStore = () => store;
