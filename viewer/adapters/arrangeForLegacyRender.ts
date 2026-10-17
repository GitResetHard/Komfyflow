/** Keep native node ordering deterministic without modifying graph topology. */
import { layoutStore } from './layoutStore'
export function nodesInRenderOrder(graph: any): any[] {
  const root = graph.rootGraph?.id ?? graph.id
  return [...(graph._nodes ?? [])].sort((a, b) => (layoutStore.getNodeLayout(root, a.id)?.zIndex ?? 0) - (layoutStore.getNodeLayout(root, b.id)?.zIndex ?? 0))
}
