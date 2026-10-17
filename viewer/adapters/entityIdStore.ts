/** Original graph-scoped allocation counters, including subgraph-safe root rekeying. */
import { shallowReactive } from 'vue';
export interface EntityIdState { lastGroupId: number; lastNodeId: number; lastLinkId: number; lastRerouteId: number }
const states = shallowReactive(new Map<string, EntityIdState>());
function get(id: string): EntityIdState {
  let state = states.get(id);
  if (!state) {
    state = shallowReactive({ lastGroupId: 0, lastNodeId: 0, lastLinkId: 0, lastRerouteId: 0 });
    states.set(id, state);
  }
  return state;
}
function rekey(previousId: string, nextId: string): void {
  if (previousId === nextId || !states.has(previousId)) return;
  if (states.has(nextId)) throw new Error('Destination graph already has ID counters');
  const state = states.get(previousId)!; states.delete(previousId); states.set(nextId, state);
}
const store = { get,
  set: (id: string, state: EntityIdState) => { states.set(id, shallowReactive(state)); },
  has: (id: string) => states.has(id), hasGraph: (id: string) => states.has(id),
  rekey, rekeyRoot: rekey, clear: (id: string) => { states.delete(id); },
  $reset: () => states.clear()
};
export const useEntityIdStore = () => store;
