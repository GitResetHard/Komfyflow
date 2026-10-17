/** Original Komfyflow host interfaces; no application-store implementation is vendored. */
export interface GraphScope { readonly rootGraphId: string; readonly owningGraphId: string }
export type EntityId = string | number;
export interface LinkTopology {
  readonly id: number;
  graphId: string;
  originNodeId: EntityId;
  originSlot: number;
  targetNodeId: EntityId;
  targetSlot: number;
  type: string | number;
  parentId?: number;
}
export interface RerouteChain {
  readonly id: number;
  graphId: string;
  parentId?: number;
  floating?: { slotType: 'input' | 'output' };
}
export interface LinkPresentation { hidden?: boolean; label?: string }
export const isFloating = (link: LinkTopology): boolean =>
  String(link.originNodeId) === '-1' || String(link.targetNodeId) === '-1';
export const endpointKey = (nodeId: EntityId, slot: number): string => JSON.stringify([String(nodeId), slot]);
export const scopeKey = (scope: GraphScope): string => JSON.stringify([scope.rootGraphId, scope.owningGraphId]);
