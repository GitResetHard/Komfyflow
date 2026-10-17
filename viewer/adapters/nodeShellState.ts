// SPDX-License-Identifier: MIT
// Original Komfyflow state ownership bridge for native MIT LGraphNode objects.
import {reactive,shallowReactive} from 'vue'
import {useNodeDataStore,type GraphScope} from './nodeDataStore'
const activeNodes=new Set<any>()
export function createNodeShellState(node:any,createInputSlotView:(node:any,slots:any[])=>any[],title:string,type?:string,titleMode?:number){
 return shallowReactive({id:'-1',graphId:'00000000-0000-0000-0000-000000000000',type:type??'',title:title??'',titleMode,flags:reactive({}),properties:reactive({}),inputs:createInputSlotView(node,shallowReactive([])),outputs:shallowReactive([]),mode:0,resizable:true,showAdvanced:false})
}
export function setTrackedNodeState(node:any,property:string,value:any):boolean {
 if(Object.is(node._state[property],value))return false
 node._state[property]=value
 node.graph?.setDirtyCanvas?.(true,true)
 return true
}
export function registerNodeState(graph:any,node:any):boolean {
 const scope:GraphScope={rootGraphId:graph.rootGraph.id,owningGraphId:graph.id}
 const store=useNodeDataStore()
 if(node._graphScope&&store.ownsNode(node._graphScope,node._state)) {
  if(node._graphScope.rootGraphId===scope.rootGraphId&&node._graphScope.owningGraphId===scope.owningGraphId)return true
  return false
 }
 const state=store.registerNode(scope,node._state)
 if(!state)return false
 node._state=state;node._graphScope=scope;activeNodes.add(node);return true
}
export function unregisterNodeState(node:any):void {
 if(node._graphScope)useNodeDataStore().deleteNode(node._graphScope,node._state)
 node._graphScope=undefined;activeNodes.delete(node)
 // A detached shell keeps its values and collection views, but no registry ownership.
 node._state=shallowReactive({...node._state})
}
export function canTransferReplacementOwnership(node:any,replacement:any):boolean {
 return !!node._graphScope&&!replacement._graphScope&&String(node.id)===String(replacement.id)&&useNodeDataStore().ownsNode(node._graphScope,node._state)
}
export function transferReplacementOwnership(node:any,replacement:any):boolean {
 if(!canTransferReplacementOwnership(node,replacement))return false
 const scope=node._graphScope;const store=useNodeDataStore();store.deleteNode(scope,node._state)
 const replacementState=store.registerNode(scope,replacement._state)
 if(!replacementState){store.registerNode(scope,node._state);return false}
 replacement._state=replacementState;replacement._graphScope=scope;node._graphScope=undefined;activeNodes.delete(node);activeNodes.add(replacement);return true
}
export function rekeyNodeScopes(previous:string,next:string,root?:string){
 for(const node of activeNodes){const scope=node._graphScope;if(!scope)continue
  if(root===undefined&&scope.rootGraphId===previous){scope.rootGraphId=next;if(scope.owningGraphId===previous)scope.owningGraphId=next}
  else if(root!==undefined&&scope.rootGraphId===root&&scope.owningGraphId===previous)scope.owningGraphId=next
  if(node.inputs)for(const input of node.inputs)if(input.widgetId&&root===undefined&&input.widgetId.startsWith(encodeURIComponent(previous)+':'))input.widgetId=encodeURIComponent(next)+input.widgetId.slice(encodeURIComponent(previous).length)
 }
}
