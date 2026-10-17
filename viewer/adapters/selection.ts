/** Scoped selection storage for native read-only inspection. */
const roots=new Map<string,Map<string,Set<string>>>();let revision=0;
export const toSelectableKey=(kind:string,id:any)=>`${kind}:${id}`;
const get=(s:any)=>{let r=roots.get(s.rootGraphId);if(!r)roots.set(s.rootGraphId,r=new Map());let v=r.get(s.owningGraphId);if(!v)r.set(s.owningGraphId,v=new Set());return v;};
const store={getRevision:()=>revision,selectedKeys:(s:any)=>[...get(s)],clearRoot:(root:string)=>{roots.delete(root);revision++;},apply:(s:any,c:any)=>{const v=get(s);if(c.type==='selection.clear')v.clear();if(c.type==='selection.replace'){v.clear();for(const k of c.keys)v.add(k);}if(c.type==='selection.add')v.add(c.key);if(c.type==='selection.remove')v.delete(c.key);revision++;}};
export const useSelectionStore=()=>store;
export const isSelectedIn=(s:any,k:string)=>get(s).has(k);
export const setSelectedIn=(s:any,k:string,v:boolean)=>store.apply(s,{type:v?'selection.add':'selection.remove',key:k});
const scope=(g:any)=>({rootGraphId:g.rootGraph.id,owningGraphId:g.id});
export function resolveSelectable(g:any,key:string){const colon=key.indexOf(':'),kind=key.slice(0,colon),id=key.slice(colon+1);if(kind==='node')return g.getNodeById(id);if(kind==='group')return g._groups.find((x:any)=>String(x.id)===id);if(kind==='reroute')return g.reroutes.get(Number(id));if(kind==='io')return [g.inputNode,g.outputNode].find(x=>String(x?.id)===id);}
const key=(item:any)=>toSelectableKey(item.constructor?.name?.includes('Group')?'group':item.constructor?.name==='Reroute'?'reroute':'node',item.id);
export const ownsSelectable=(c:any,item:any)=>!!c.graph&&(item.graph===c.graph||item._graph===c.graph);
export const isCanvasItemSelected=(c:any,item:any)=>!!c.graph&&isSelectedIn(scope(c.graph),key(item));
export function updateGraphSelection(g:any,item:any,on:boolean){setSelectedIn(scope(g),key(item),on);return true;}
export function clearGraphSelection(g:any){if(g)store.apply(scope(g),{type:'selection.clear'});return true;}
export const clearCanvasSelection=(c:any)=>clearGraphSelection(c.graph);
export function applyCanvasSelection(c:any,command:any){if(!c.graph)return false;store.apply(scope(c.graph),command);return true;}
export function changeCanvasSelection(c:any,items:any[],on:boolean){const g=c.graph||c;for(const item of items)updateGraphSelection(g,item,on);return true;}
export function replaceCanvasSelection(c:any,items:any[]){return applyCanvasSelection(c,{type:'selection.replace',keys:[...items].map(key)});}
export function selectedCanvasNodes(c:any){if(!c?.graph)return [];return store.selectedKeys(scope(c.graph)).filter(k=>k.startsWith('node:')).map(k=>resolveSelectable(c.graph,k)).filter(Boolean);}
export const releaseCanvasSelection=()=>{};
export const applyClickSelection=(c:any,_intent:any,item:any)=>item?replaceCanvasSelection(c,[item]):clearCanvasSelection(c);
export const resolveClickSelection=(v:any)=>v;
export const resolveMarqueeSelection=(v:any)=>v;
export const applyMarqueeSelection=(c:any,items:any)=>replaceCanvasSelection(c,Array.isArray(items)?items:[]);
const links={selection:null as any,select(...args:any[]){this.selection=args.length===1?args[0]:{rootGraphId:args[0],owningGraphId:args[1],linkId:args[2]};},clear(){this.selection=null;}};
export const useLinkSelectionStore=()=>links;
Object.assign(store,{
 hasGraph:(root:string)=>roots.has(root),
 hasOwner:(s:any)=>roots.get(s.rootGraphId)?.has(s.owningGraphId)??false,
 rekeyRoot:(before:string,after:string)=>{if(before===after)return;if(roots.has(after))throw Error('Selection root collision');const values=roots.get(before);if(!values)return;roots.delete(before);if(values.has(before)){values.set(after,values.get(before)!);values.delete(before);}roots.set(after,values);revision++;},
 rekeyOwner:(root:string,before:string,after:string)=>{const values=roots.get(root);if(!values?.has(before)||before===after)return;if(values.has(after))throw Error('Selection owner collision');values.set(after,values.get(before)!);values.delete(before);revision++;}
});
