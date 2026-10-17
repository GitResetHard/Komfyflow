// SPDX-License-Identifier: MIT
// Original Komfyflow node-state registry. Identity is unique across a root graph.
import {shallowReactive, reactive} from 'vue'
export type GraphScope={rootGraphId:string;owningGraphId:string}
const roots=shallowReactive(new Map<string,Map<string,any>>())
function bucket(root:string,create=false){let map=roots.get(root);if(!map&&create){map=shallowReactive(new Map());roots.set(root,map)}return map}
function registerNode(scope:GraphScope,state:any){
 const map=bucket(scope.rootGraphId,true)!,id=String(state.id),existing=map.get(id)
 if(existing&&existing!==state)return undefined
 if(existing)return existing
 state.graphId=scope.owningGraphId
 state.flags=reactive(state.flags??{})
 state.properties=reactive(state.properties??{})
 const tracked=shallowReactive(state);map.set(id,tracked);return tracked
}
const store={
 registerNode,
 getGraphNodesFor:(root:string,owner:string)=>[...(bucket(root)?.values()??[])].filter(s=>s.graphId===owner),
 getNode:(scope:GraphScope,id:string|number)=>{const s=bucket(scope.rootGraphId)?.get(String(id));return s?.graphId===scope.owningGraphId?s:undefined},
 ownsNode(scope:GraphScope,state:any){return bucket(scope.rootGraphId)?.get(String(state.id))===state&&state.graphId===scope.owningGraphId},
 deleteNode(scope:GraphScope,state:any){if(!store.ownsNode(scope,state))return false;return bucket(scope.rootGraphId)!.delete(String(state.id))},
 clearGraph(root:string){roots.delete(root)},
 clearOwner(scope:GraphScope){const map=bucket(scope.rootGraphId);if(map)for(const [id,state] of [...map])if(state.graphId===scope.owningGraphId)map.delete(id)},
 hasGraph(root:string){return !!bucket(root)?.size},
 hasOwner(scope:GraphScope){return store.getGraphNodesFor(scope.rootGraphId,scope.owningGraphId).length>0},
 rekeyRoot(a:string,b:string){const map=roots.get(a);if(!map)return;roots.delete(a);roots.set(b,map);for(const state of map.values())if(state.graphId===a)state.graphId=b},
 rekeyOwner(root:string,a:string,b:string){for(const state of bucket(root)?.values()??[])if(state.graphId===a)state.graphId=b},
 $reset(){roots.clear()}
}
export function useNodeDataStore(){return store}
