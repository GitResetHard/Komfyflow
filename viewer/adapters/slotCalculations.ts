/** Original slot projection using native node state and native layout constants. */
import { litegraph } from '../vendor/litegraph/src/litegraphInstance'
import { layoutStore } from './layoutStore'
export interface SlotPositionContext {
  nodeX: number; nodeY: number; nodeWidth: number; nodeHeight: number
  collapsed: boolean; collapsedWidth?: number; slotStartY?: number
  inputs: any[]; outputs: any[]; widgets?: any[]
}
function constants() { return litegraph() }
function slotPosition(context: SlotPositionContext, slot: any, input: boolean): [number, number] {
  const { nodeX: x, nodeY: y, nodeWidth: width } = context
  const { NODE_SLOT_HEIGHT: step, NODE_TITLE_HEIGHT: title, NODE_COLLAPSED_WIDTH: collapsedWidth } = constants()
  if (context.collapsed) return [input ? x : x + (context.nodeWidth || context.collapsedWidth || collapsedWidth), y - title / 2]
  if (slot?.pos) return [x + slot.pos[0], y + slot.pos[1]]
  const candidates = (input ? context.inputs : context.outputs).filter(item => !item.pos && !(input && context.widgets?.length && item.widget))
  let index = candidates.indexOf(slot)
  if (index < 0 && slot) index = candidates.findIndex(item => item.name === slot.name)
  index = Math.max(0, index)
  return [input ? x + step / 2 : x + width + 1 - step / 2, y + (index + 0.7) * step + (context.slotStartY || 0)]
}
export function calculateInputSlotPosFromSlot(context: SlotPositionContext, input: any): [number, number] { return slotPosition(context, input, true) }
export function calculateOutputSlotPosFromSlot(context: SlotPositionContext, output: any): [number, number] { return slotPosition(context, output, false) }
function contextOf(node: any): SlotPositionContext {
  const size = node.renderingSize ?? node.size
  return { nodeX: node.pos[0], nodeY: node.pos[1], nodeWidth: size[0], nodeHeight: size[1], collapsed: node.flags?.collapsed ?? false, collapsedWidth: node._collapsed_width, slotStartY: node.constructor.slot_start_y, inputs: node.inputs ?? [], outputs: node.outputs ?? [], widgets: node.widgets }
}
function storedSlot(node: any, slotIndex: number, isInput: boolean): any {
  if (!node.graph) return undefined
  const layout = layoutStore.getNodeLayout(node.graph.rootGraph?.id ?? node.graph.id, node.id)
  const collection = isInput ? layout?.inputs : layout?.outputs
  return collection?.[slotIndex] ?? layout?.slots?.find((slot: any) => slot.index === slotIndex && slot.type === (isInput ? 'input' : 'output'))
}
export function getSlotPosition(node: any, slotIndex: number, isInput: boolean): [number, number] {
  if (litegraph().vueNodesMode) {
    const layout = storedSlot(node, slotIndex, isInput)
    if (layout?.position) return [layout.position.x, layout.position.y]
  }
  const context = contextOf(node)
  if (isInput && slotIndex === -1 && !context.collapsed) return [context.nodeX + constants().NODE_TITLE_HEIGHT / 2, context.nodeY + constants().NODE_TITLE_HEIGHT / 2]
  return slotPosition(context, (isInput ? node.inputs : node.outputs)?.[slotIndex], isInput)
}
export function getSlotLayoutAtPoint(graph: any, point: { x: number; y: number }, node?: any) {
  const candidates = node ? [node] : [...(graph._nodes ?? [])].reverse()
  for (const candidate of candidates) {
    for (const isInput of [true, false]) {
      const slots = isInput ? candidate.inputs : candidate.outputs
      for (let index = 0; index < (slots?.length ?? 0); index++) {
        const stored = storedSlot(candidate, index, isInput)
        const [x, y] = getSlotPosition(candidate, index, isInput)
        const radius = stored?.radius ?? 10
        if (Math.hypot(point.x - x, point.y - y) > radius) continue
        return { ...stored, nodeId: candidate.id, index, type: isInput ? 'input' : 'output', position: { x, y }, slot: slots[index] }
      }
    }
  }
  return null
}
