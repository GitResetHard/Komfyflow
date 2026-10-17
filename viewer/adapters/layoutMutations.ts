import { layoutStore } from './layoutStore'
export function useLayoutMutations(source: any = 'canvas') {
  const setNodeZIndex = (graphId: any, nodeId: any, zIndex: number) => layoutStore.applyOperation({ type: 'setNodeZIndex', graphId, nodeId, zIndex, source, timestamp: Date.now() })
  return {
    setNodeZIndex,
    setNodeOrder(graph: any, nodeId: any, direction: 'front' | 'back') {
      const root = graph.rootGraph?.id ?? graph.id
      const layouts = (graph._nodes ?? []).map((node: any) => layoutStore.getNodeLayout(root, node.id)).filter(Boolean)
      const order = direction === 'back' ? Math.min(0, ...layouts.map((node: any) => node.zIndex)) - 1 : layoutStore.allocateZIndex()
      setNodeZIndex(root, nodeId, order)
      graph.setDirtyCanvas?.(true, true)
    },
    moveNode(graphId: any, nodeId: any, position: any) { layoutStore.applyOperation({ type: 'moveNode', graphId, nodeId, position, source }) },
    resizeNode(graphId: any, nodeId: any, size: any) { layoutStore.applyOperation({ type: 'resizeNode', graphId, nodeId, size, source }) },
    setNodeBounds(graphId: any, nodeId: any, bounds: any) { layoutStore.applyOperation({ type: 'setNodeBounds', graphId, nodeId, bounds, source }) }
  }
}
