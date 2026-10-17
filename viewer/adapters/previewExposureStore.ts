// SPDX-License-Identifier: MIT
// Original Komfyflow preview exposure metadata store. Media is never fetched here.
import {shallowReactive} from 'vue'
export interface PreviewExposure {name:string;sourceNodeId:string;sourcePreviewName:string;[key:string]:any}
const graphs=shallowReactive(new Map<string,Map<string,PreviewExposure[]>>())
export function tryGetPreviewExposureHostLocator(host:any):string|null {return !host.graph||String(host.id)==='-1'?null:host.graph.id===host.graph.rootGraph?.id?String(host.id):`${host.graph.id}:${host.id}`}
export function getPreviewExposureHostLocator(host:any):string|null {return tryGetPreviewExposureHostLocator(host)}
function bucket(root:string){let map=graphs.get(root);if(!map){map=shallowReactive(new Map());graphs.set(root,map)}return map}
function getExposures(root:string,host:string):readonly PreviewExposure[]{return graphs.get(root)?.get(host)??[]}
function setExposures(root:string,host:string,items:readonly any[]){const normalized=items.filter(e=>e&&typeof e.name==='string'&&e.sourceNodeId!=null&&typeof e.sourcePreviewName==='string').map(e=>({...e,sourceNodeId:String(e.sourceNodeId)}));if(normalized.length)bucket(root).set(host,normalized);else graphs.get(root)?.delete(host)}
const store={getExposures,setExposures,
 addExposure(root:string,host:string,source:{sourceNodeId:string|number;sourcePreviewName:string}){const all=[...getExposures(root,host)];let name=source.sourcePreviewName,index=1;while(all.some(e=>e.name===name))name=`${source.sourcePreviewName}#${index++}`;const exposure={...source,sourceNodeId:String(source.sourceNodeId),name};setExposures(root,host,[...all,exposure]);return exposure},
 removeExposure(root:string,host:string,name:string){setExposures(root,host,getExposures(root,host).filter(e=>e.name!==name))},
 clearHost(root:string,host:string){graphs.get(root)?.delete(host)},
 clearGraph(root:string){graphs.delete(root)},
 getExposuresAsPromotionShape(root:string,host:string){return getExposures(root,host).map(e=>({name:e.name,nodeId:e.sourceNodeId,widgetName:e.sourcePreviewName}))},
 resolveChain(root:string,host:string,name:string,resolveNestedHost?:(nodeId:string)=>any){const seen=new Set<string>();for(let depth=0;depth<64;depth++){const key=host+'\0'+name;if(seen.has(key))return undefined;seen.add(key);const e=getExposures(root,host).find(e=>e.name===name);if(!e)return undefined;const nested=resolveNestedHost?.(e.sourceNodeId);if(!nested)return {...e,sourceNodeId:e.sourceNodeId,sourcePreviewName:e.sourcePreviewName};host=typeof nested==='string'?nested:nested.hostNodeLocator??nested.hostLocator;name=e.sourcePreviewName;if(!host)return undefined}return undefined},
 hasGraph(root:string){return !!graphs.get(root)?.size},
 rekeyRoot(a:string,b:string){const all=graphs.get(a);if(!all)return;graphs.delete(a);graphs.set(b,all);store.rekeyOwner(b,a,b)},
 rekeyOwner(root:string,a:string,b:string){const all=graphs.get(root);if(all)for(const [host,e]of [...all])if(host.startsWith(a+':')){all.delete(host);all.set(b+host.slice(a.length),e)}},
 $reset(){graphs.clear()}
}
export function usePreviewExposureStore(){return store}
