// SPDX-License-Identifier: MIT
// Original Komfyflow root/node-scoped widget authority; no host application code.
import { shallowReactive, reactive } from 'vue'
import {widgetId,parseWidgetId} from './widgetId'
import {deriveWidgetVisibility,type WidgetVisibilityComponent} from './widgetVisibility'
export interface WidgetRenderState {hasLayoutSize?:boolean;isDOMWidget?:boolean;tooltip?:string}
export interface WidgetState {nodeId:string;name:string;type:string;value:any;options:any;y:number;label?:string;serialize?:boolean;disabled?:boolean;[key:string]:any}
type Entity={state:WidgetState;render:WidgetRenderState;visibility:WidgetVisibilityComponent}
type Restoration={positional:any[];named?:Record<string,any>;restoreNamed?:boolean}
const entities=shallowReactive(new Map<string,Entity>())
const orders=shallowReactive(new Map<string,string[]>())
const restoration=new Map<string,Restoration>()
const retained=new Map<string,Map<string,any>>()
const nodeKey=(g:string,n:string|number)=>JSON.stringify([g,String(n)])
const idsFor=(g:string,n:string|number)=>[...entities.keys()].filter(id=>{const p=parseWidgetId(id);return p?.graphId===g&&p.nodeId===String(n)})
function getNodeWidgetIds(g:string,n:string|number):string[] {const ids=idsFor(g,n),wanted=new Set(ids);return [...new Set((orders.get(nodeKey(g,n))??ids).filter(i=>wanted.has(i)))]}
function getWidget(id:string) {return entities.get(id)?.state}
function deleteWidget(id:string):boolean {const p=parseWidgetId(id);if(!p)return false;const key=nodeKey(p.graphId,p.nodeId);orders.set(key,(orders.get(key)??[]).filter(i=>i!==id));return entities.delete(id)}
function registerWidget(id:string,init:any,render:WidgetRenderState={},visibility?:WidgetVisibilityComponent):WidgetState|undefined {
 const p=parseWidgetId(id);if(!p)return undefined
 const previous=entities.get(id)
 if(previous){ // Rebinding metadata must not overwrite an edited value or replace the shared identity.
  const {value:_,...metadata}=init;Object.assign(previous.state,metadata,{name:p.name,nodeId:p.nodeId})
  Object.assign(previous.render,render)
  if(visibility&&visibility!==previous.visibility){Object.assign(previous.visibility.surfaces,visibility.surfaces);Object.assign(previous.visibility.suppression,visibility.suppression)}
  return previous.state
 }
 const values=retained.get(nodeKey(p.graphId,p.nodeId))
 const value=values?.has(p.name)?values.get(p.name):init.value
 const state=shallowReactive({disabled:false,options:{},y:0,...init,value,name:p.name,nodeId:p.nodeId}) as WidgetState
 entities.set(id,{state,render:shallowReactive({...render}),visibility:reactive(visibility??deriveWidgetVisibility(init))})
 const key=nodeKey(p.graphId,p.nodeId);orders.set(key,[...(orders.get(key)??[]),id]);return state
}
function clearNode(g:string,n:string|number) {for(const id of idsFor(g,n))deleteWidget(id);const key=nodeKey(g,n);orders.delete(key);restoration.delete(key);retained.delete(key)}
function clearGraph(g:string) {for(const id of [...entities.keys()])if(parseWidgetId(id)?.graphId===g)deleteWidget(id);for(const map of [orders,restoration,retained])for(const key of [...map.keys()])if(JSON.parse(key)[0]===g)map.delete(key)}
function rekeyRoot(a:string,b:string) {
 if(a===b)return
 for(const [id,e] of [...entities]){const p=parseWidgetId(id)!;if(p.graphId!==a)continue;entities.delete(id);entities.set(widgetId(b,p.nodeId,p.name),e)}
 for(const map of [orders,restoration,retained] as Map<string,any>[]){for(const [key,value] of [...map]){const [g,n]=JSON.parse(key);if(g!==a)continue;map.delete(key);map.set(nodeKey(b,n),map===orders?value.map((id:string)=>{const p=parseWidgetId(id)!;return widgetId(b,p.nodeId,p.name)}):value)}}
}
function getRestoredWidgetValue(g:string,n:string|number,name:string,index:number) {
 const r=restoration.get(nodeKey(g,n));if(!r)return undefined
 if(r.restoreNamed&&r.named) return Object.hasOwn(r.named,name)?{value:r.named[name]}:undefined
 return Number.isInteger(index)&&index>=0&&index<r.positional.length?{value:r.positional[index]}:undefined
}
export function stripGraphPrefix(value:string|number):string|null {if(value==null)return null;const s=String(value);return s.includes(':')?s.slice(s.lastIndexOf(':')+1):s}
const store={
 registerWidget,getWidget,deleteWidget,getNodeWidgetIds,
 getWidgetRenderState:(id:string)=>entities.get(id)?.render,
 getWidgetVisibility:(id:string)=>entities.get(id)?.visibility,
 getNodeWidgets:(g:string,n:string|number)=>getNodeWidgetIds(g,n).map(id=>getWidget(id)!),
 setValue(id:string,value:any){const s=getWidget(id);if(!s)return false;s.value=value;return true},
 announceValue(_id:string){ /* Values are shallow-reactive and notify their subscribers directly. */ },
 setLabel(id:string,label:string){const s=getWidget(id);if(!s)return false;s.label=label;return true},
 setOptions(id:string,options:any){const s=getWidget(id);if(!s)return false;s.options=options;return true},
 updateOptions(id:string,options:any){const s=getWidget(id);if(!s)return false;s.options={...s.options,...options};return true},
 renameWidget(oldId:string,newId:string){const old=parseWidgetId(oldId),next=parseWidgetId(newId),e=entities.get(oldId);if(!e||!old||!next)return undefined;if(oldId===newId)return e.state;if(entities.has(newId)||old.graphId!==next.graphId||old.nodeId!==next.nodeId)return undefined;entities.delete(oldId);entities.set(newId,e);e.state.name=next.name;const key=nodeKey(old.graphId,old.nodeId);orders.set(key,(orders.get(key)??[]).map(id=>id===oldId?newId:id));return e.state},
 setNodeWidgetOrder(g:string,n:string|number,ids:readonly string[]){const valid=new Set(idsFor(g,n));orders.set(nodeKey(g,n),[...new Set([...ids.filter(i=>valid.has(i)),...getNodeWidgetIds(g,n)])])},
 replaceNodeWidgetOrder(g:string,n:string|number,ids:readonly string[]){const valid=new Set(idsFor(g,n));orders.set(nodeKey(g,n),[...new Set(ids.filter(i=>valid.has(i)))])},
 reconcileNodeWidgetOrder(g:string,n:string|number,ids:readonly string[]){store.setNodeWidgetOrder(g,n,ids);return getNodeWidgetIds(g,n)},
 setNodeWidgetRestoration(g:string,n:string|number,r:Restoration){restoration.set(nodeKey(g,n),r)},getRestoredWidgetValue,
 getRestoredWidgetValueCount(g:string,n:string|number){const r=restoration.get(nodeKey(g,n));return r?r.restoreNamed&&r.named?Object.keys(r.named).length:r.positional.length:undefined},
 clearNodeWidgetRestoration(g:string,n:string|number){restoration.delete(nodeKey(g,n))},
 releaseNodeWidgets(g:string,n:string|number,{discardValues}:{discardValues:boolean}){const values=new Map(store.getNodeWidgets(g,n).map(s=>[s.name,s.value]));clearNode(g,n);if(!discardValues&&values.size)retained.set(nodeKey(g,n),values)},
 clearNode,clearGraph,rekeyRoot,rekeyOwner(_g:string,_a:string,_b:string){},
 hasGraph(g:string){return [...entities.keys()].some(id=>parseWidgetId(id)?.graphId===g)||[orders,restoration,retained].some(map=>[...map.keys()].some(key=>JSON.parse(key)[0]===g))},
 $reset(){entities.clear();orders.clear();restoration.clear();retained.clear()}
}
export function useWidgetValueStore(){return store}
