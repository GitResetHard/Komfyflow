import { LiteGraph, LGraph, LGraphCanvas, LGraphNode, SubgraphNode } from './vendor/litegraph/src/litegraph';
import { sanitizeWorkflow } from './sanitize.mjs';
const canvas=document.querySelector('canvas')!;
const status=document.getElementById('status')!;
const graph=new LGraph();
graph.events.addEventListener('subgraph-created',event=>{const {subgraph}=event.detail;class NativeSubgraph extends SubgraphNode{constructor(){super(graph,subgraph,{id:'-1',type:subgraph.id,pos:[0,0],size:[280,150],flags:{},order:0,mode:4});}}LiteGraph.registerNodeType(subgraph.id,NativeSubgraph);});
const view=new LGraphCanvas(canvas,graph);
view.read_only=true; view.allow_interaction=false; view.allow_dragnodes=false; view.allow_dragcanvas=true;
view.render_shadows=false; view.background_image='';
LiteGraph.allow_scripts=false;
let token=''; let current:any; let rootGraph=graph;
function send(type:string,data:any={}){parent.postMessage({channel:'komfyflow-viewer',type,token,...data},'*');}
function resize(){view.resize(innerWidth,innerHeight);view.setDirty(true,true);}
function fit(){const nodes=view.graph?._nodes||[]; if(!nodes.length)return;const x=Math.min(...nodes.map(n=>n.pos[0])),y=Math.min(...nodes.map(n=>n.pos[1]-40)),right=Math.max(...nodes.map(n=>n.pos[0]+n.size[0])),bottom=Math.max(...nodes.map(n=>n.pos[1]+n.size[1]));view.ds.scale=Math.min(1.25,Math.max(.03,Math.min((innerWidth-100)/(right-x||1),(innerHeight-100)/(bottom-y||1))));view.ds.offset[0]=(innerWidth/view.ds.scale-(right-x))/2-x;view.ds.offset[1]=(innerHeight/view.ds.scale-(bottom-y))/2-y;view.setDirty(true,true);}
function register(data:any){const subs=new Set((data.definitions?.subgraphs||[]).map((s:any)=>s.id));for(const n of data.nodes||[]){if(subs.has(n.type)||LiteGraph.registered_node_types[n.type])continue; class DisplayNode extends LGraphNode{constructor(){super(n.type);}}LiteGraph.registerNodeType(n.type,DisplayNode);}for(const sub of data.definitions?.subgraphs||[])register(sub);}
function widgets(g:any,data:any,seen=new Set()){if(seen.has(g))return;seen.add(g);const byId=new Map((data.nodes||[]).map((n:any)=>[String(n.id),n]));for(const node of g._nodes||[]){const info:any=byId.get(String(node.id));if(!info)continue;const original=info.size||node.size.slice();const named=Object.entries(info.widgets_values_named||{});const values=named.length?named:(info.widgets_values||[]).map((v:any,i:number)=>[`value ${i+1}`,v]);for(const [name,v]of values){const display=typeof v==='object'?JSON.stringify(v):String(v);const existing=node.widgets?.find((w:any)=>w.name===name);if(existing)existing.value=display;else node.addWidget('text',name,display,()=>{},{serialize:false});}node.size=original;node.mode=4;}for(const subData of data.definitions?.subgraphs||[]){const sub=g.subgraphs.get(subData.id);if(sub)widgets(sub,subData,seen);}}
const inspect=(node:any)=>send('inspect',{node:{id:node.id,type:node.type,title:node.title,values:node.widgets?.map(w=>({name:w.name,value:w.value}))||[]}});
let down=[0,0];canvas.addEventListener('pointerdown',e=>{down=[e.clientX,e.clientY];});canvas.addEventListener('pointerup',e=>{if(Math.hypot(e.clientX-down[0],e.clientY-down[1])>5)return;const x=e.offsetX/view.ds.scale-view.ds.offset[0],y=e.offsetY/view.ds.scale-view.ds.offset[1];const node=view.graph?.getNodeOnPos(x,y);if(node)inspect(node);});
// No editor menus, paste, drops, shortcuts, arbitrary node panels or extensions.
canvas.addEventListener('contextmenu',e=>{e.preventDefault();e.stopImmediatePropagation();},true);
for(const event of ['drop','dragover','paste','keydown','dblclick'])window.addEventListener(event,e=>{e.preventDefault();e.stopImmediatePropagation();},true);
window.addEventListener('message',event=>{
 if(event.source!==parent||event.data?.channel!=='komfyflow-host')return;
 const m=event.data;if(typeof m.token!=='string'||m.token.length<16)return;
 if(token&&m.token!==token)return;token=m.token;
 try{
  if(m.type==='load'){
   const parsed=sanitizeWorkflow(m.workflow);current=parsed;register(parsed.graph);graph.configure(parsed.graph);widgets(graph,parsed.graph);view.setGraph(graph);resize();fit();
   status.textContent=parsed.format==='api'?'API graph · auto-layout':'Native ComfyUI renderer · read only';
   send('loaded',{format:parsed.format,warnings:parsed.warnings,nodeCount:graph._nodes.length,subgraphs:[...graph.subgraphs.values()].map(s=>({id:s.id,name:s.name})),rerouteCount:graph.reroutes.size});
  }else if(m.type==='fit')fit();
  else if(m.type==='zoom'){view.ds.scale=Math.max(.03,Math.min(4,view.ds.scale*(m.direction===1?1.2:1/1.2)));view.setDirty(true,true);}
  else if(m.type==='subgraph'){const sub=graph.subgraphs.get(m.id);if(sub){view.openSubgraph(sub);fit();}}
  else if(m.type==='root'){view.setGraph(rootGraph);fit();}
 }catch(e){status.textContent='Unable to display this workflow safely';send('error',{message:e instanceof Error?e.message:'Invalid workflow'});}
});
window.addEventListener('resize',resize);resize();send('ready');
