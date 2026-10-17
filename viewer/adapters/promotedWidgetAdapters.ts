// SPDX-License-Identifier: MIT
// Original Komfyflow subgraph widget resolution and metadata validation.
import {useWidgetValueStore} from './widgetValueStore'
export function parsePreviewExposures(value:unknown):any[] {
 if(!Array.isArray(value))return []
 const names=new Set<string>()
 return value.flatMap(e=>{if(!e||typeof e!=='object'||typeof e.name!=='string'||!e.name||!['string','number'].includes(typeof e.sourceNodeId)||typeof e.sourcePreviewName!=='string'||!e.sourcePreviewName||names.has(e.name))return [];names.add(e.name);return [{name:e.name,sourceNodeId:String(e.sourceNodeId),sourcePreviewName:e.sourcePreviewName}]})
}
export function parseProxyWidgetErrorQuarantine(value:unknown):any[] {
 if(!Array.isArray(value))return []
 return value.filter(e=>e&&typeof e==='object'&&Array.isArray(e.originalEntry)&&e.originalEntry.length===2&&['string','number'].includes(typeof e.originalEntry[0])&&typeof e.originalEntry[1]==='string').map(e=>({...e,originalEntry:[String(e.originalEntry[0]),e.originalEntry[1]]}))
}
export function resolveSubgraphInputTarget(host:any,inputName:string):{nodeId:string;widgetName:string}|undefined {
 const graph=host?.subgraph;if(!graph)return undefined
 const boundary=graph.inputs?.find((i:any)=>i.name===inputName)??graph.inputNode?.slots?.find((i:any)=>i.name===inputName)
 if(!boundary)return undefined
 for(const id of boundary.linkIds??[]){const link=graph.getLink?.(id)??graph.links?.get(id);if(!link)continue
  const target=link.resolve?.(graph)
  const node=target?.inputNode??graph.getNodeById?.(link.target_id)
  const input=target?.input??node?.inputs?.[link.target_slot]
  if(!node||!input)continue
  const name=input.widget?.name??input._widget?.name??(node.subgraph?input.name:undefined)
  if(typeof name==='string')return {nodeId:String(node.id),widgetName:name}
 }
 return undefined
}
export function resolveConcretePromotedWidget(host:any,rawNodeId:string|number,widgetName:string):any {
 if(!host?.subgraph)return {status:'failure',failure:'invalid-host'}
 const seen=new Set<any>(),nodePath:string[]=[]
 let current=host,id=String(rawNodeId),name=widgetName
 for(let depth=0;depth<64;depth++){
  const node=current.subgraph?.getNodeById?.(id)
  if(!node)return {status:'failure',failure:'missing-node'}
  if(seen.has(node))return {status:'failure',failure:'cycle'}
  seen.add(node);nodePath.push(String(node.id))
  if(node.subgraph){const target=resolveSubgraphInputTarget(node,name);if(target){current=node;id=target.nodeId;name=target.widgetName;continue}}
  const widget=node.widgets?.find((w:any)=>w.name===name)
  if(!widget)return {status:'failure',failure:'missing-widget'}
  return {status:'resolved',resolved:{node,widget,nodePath}}
 }
 return {status:'failure',failure:'max-depth-exceeded'}
}
export function adoptPromotedWidgetValue(hostInput:any,targetNode:any,targetSlot:number):void {
 const id=hostInput.widgetId
 const state=id?useWidgetValueStore().getWidget(id):undefined
 const source=state??hostInput._widget
 if(!source)return
 const input=targetNode.inputs?.[targetSlot]
 const widget=input?targetNode.getWidgetFromSlot?.(input)??input._widget:undefined
 if(widget)widget.value=source.value
 else if(input?.widgetId)useWidgetValueStore().setValue(input.widgetId,source.value)
}
