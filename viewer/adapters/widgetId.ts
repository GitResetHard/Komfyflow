// SPDX-License-Identifier: MIT
// Original Komfyflow host adapter. IDs are encoded, root-scoped tuples.
export type WidgetId = string & { readonly __brand: 'WidgetId' }
export function widgetId(graphId: string, nodeId: string | number, name: string): WidgetId {
  return [graphId, String(nodeId), name].map(encodeURIComponent).join(':') as WidgetId
}
export function parseWidgetId(id: string) {
  const parts = id.split(':')
  if (parts.length !== 3 || parts.some(p => !p)) return undefined
  try {
    const [graphId, nodeId, name] = parts.map(decodeURIComponent)
    return { graphId, nodeId, localNodeId: nodeId, name }
  } catch { return undefined }
}
export function isWidgetId(id: unknown): id is WidgetId {
  return typeof id === 'string' && parseWidgetId(id) !== undefined
}
export type RefusedWidget<T> = { widget: T; cause: 'unreadable-name' | 'duplicate-name' | 'unresolved-duplicate'; name: string | undefined }
function readName(widget: any): string | undefined {
  try { const name=widget?.name; return typeof name === 'string' ? name : undefined } catch { return undefined }
}
export function isWidgetNameUnreadable(widget: any): boolean { return readName(widget) === undefined }
const walking = new WeakSet<object>()
function settle<T extends {name: unknown}>(widgets: readonly T[], taken: (s: string) => boolean) {
  const refused: RefusedWidget<T>[] = []
  const names = new Set(widgets.map(readName).filter((n): n is string => n !== undefined))
  const used = new Map<string, T>()
  for (const w of widgets) {
    const name = readName(w)
    if (name === undefined) { refused.push({widget:w, cause:'unreadable-name', name}); continue }
    if (!used.has(name) || used.get(name) === w) { used.set(name,w); continue }
    let suffix = 1
    while (names.has(`${name}#${suffix}`) || taken(`${name}#${suffix}`)) suffix++
    const next = `${name}#${suffix}`
    try { Reflect.set(w, 'name', next) } catch { /* A pinned extension name cannot be changed. */ }
    const result = readName(w)
    if (result === next) { names.add(next); used.set(next,w) }
    else refused.push({widget:w, cause:result !== name && result !== undefined ? 'unresolved-duplicate' : 'duplicate-name', name})
  }
  return refused
}
export function ensureUniqueWidgetNames(widgets: readonly {name: string}[]): boolean {
  if (walking.has(widgets)) return true
  walking.add(widgets)
  try { return settle(widgets, () => false).length === 0 } finally { walking.delete(widgets) }
}
export function dropUnrenamableDuplicateWidgets<T extends {name: unknown}>(widgets:T[], isNameTaken = (_name:string) => false): RefusedWidget<T>[] {
  if (walking.has(widgets)) return []
  walking.add(widgets)
  try {
    const refused=settle(widgets,isNameTaken)
    const remove=new Set(refused.filter(r=>r.cause!=='unresolved-duplicate').map(r=>r.widget))
    for(let i=widgets.length-1;i>=0;i--) if(remove.has(widgets[i])) widgets.splice(i,1)
    return refused
  } finally { walking.delete(widgets) }
}
