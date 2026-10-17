/** Original Komfyflow host contracts. No ComfyUI application implementation is copied. */
export const UNASSIGNED_NODE_ID='-1';
export const toNodeId=(v:any)=>String(v);
export const serializeNodeId=(v:any)=>{const n=Number(v);return Number.isSafeInteger(n)&&String(n)===String(v)?n:String(v)};
export const parseNodeId=(v:any)=>typeof v==='string'&&v.length? v : typeof v==='number'&&Number.isInteger(v)?String(v):null;
export const compareNodeIds=(a:any,b:any)=>{const na=Number(a),nb=Number(b);return Number.isFinite(na)&&Number.isFinite(nb)?na-nb:String(a).localeCompare(String(b));};
export const toLinkId=(v:any)=>Number(v),toGroupId=toLinkId,toRerouteId=toLinkId;
export const parseLinkId=(v:any)=>Number.isInteger(Number(v))?Number(v):null;
export const toRootGraphId=(v:any)=>v,toOwningGraphId=toRootGraphId;
export const graphScopeOf=(g:any)=>({rootGraphId:g.rootGraph.id,owningGraphId:g.id});
export const zeroUuid='00000000-0000-0000-0000-000000000000';
export const createUuidv4=()=>crypto.randomUUID();
export const isFloatingTopology=(t:any)=>String(t.originNodeId)==='-1'||String(t.targetNodeId)==='-1';
export function assert(v:any,message='Native viewer invariant failed'):asserts v{if(!v)throw Error(message);}
export const useTelemetry=()=>undefined;
export const reportError=(e:any)=>console.error('Native workflow viewer:',e);
export const getCnrIdFromNode=()=>undefined;
export const t=(key:string)=>key.split('.').at(-1)||key;
export const st=(key:string,fallback?:string)=>fallback||t(key);
export const isMiddleButtonEvent=(e:any)=>e.button===1;
export const isMiddleButtonHeld=(e:any)=>(e.buttons&4)!==0;
export const MAX_MULTITYPE_SLICES=4;
export const isUuidShapedSubgraphId=(v:any)=>typeof v==='string'&&/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v);
export const createNodeLocatorId=(v:any,id?:any)=>id===undefined?JSON.stringify(v):v==null?String(id):`${v}:${id}`;
export const hexToInt=(v:string)=>parseInt(v.replace('#',''),16);
export const intToHex=(v:number)=>'#'+Math.max(0,Math.min(0xffffff,v)).toString(16).padStart(6,'0');
export function hexToRgb(v:string){let h=v.replace('#','');if(h.length===3)h=h.split('').map(x=>x+x).join('');const n=parseInt(h,16);return [n>>16&255,n>>8&255,n&255];}
export function luminance(v:any){const a=typeof v==='string'?hexToRgb(v):v;return .2126*a[0]+.7152*a[1]+.0722*a[2];}
export const readableTextColor=(v:any)=>luminance(v)>140?'#111111':'#ffffff';
export const textOnColor=readableTextColor;
export function adjustColor(v:string,options:any){if(options?.lightness==null&&(options?.opacity==null||options.opacity===1))return v;const light=Number(options?.lightness??0),opacity=options?.opacity;const c=hexToRgb(v).map(n=>Math.max(0,Math.min(255,Math.round(n+light))));return opacity!==undefined?`rgba(${c.join(',')},${opacity})`:intToHex((c[0]<<16)+(c[1]<<8)+c[2]);}
export function forEachNode(g:any,fn:(n:any)=>void,seen=new Set()){if(!g||seen.has(g))return;seen.add(g);for(const n of g._nodes||[]){fn(n);if(n.subgraph)forEachNode(n.subgraph,fn,seen);}}
export const visitGraphNodes=forEachNode;
// Editing-only edge autopan deliberately unavailable; manual read-only panning stays native.
export class AutoPanController {constructor(_opts:any){} updatePointer(_x:any,_y:any){} start(){} stop(){}}
export const LayoutSource={LiteGraph:'litegraph',Canvas:'canvas',Vue:'vue',User:'user'};
