// Data only: never pass arbitrary uploaded properties into native configure().
const safeString = v => String(v ?? '').replace(/[\u0000-\u001f]/g,' ').slice(0,4096);
const id = v => typeof v === 'number' && Number.isFinite(v) ? v : safeString(v).slice(0,128);
const num = (v,f=0) => Number.isFinite(v) ? Math.max(-1e7,Math.min(1e7,v)) : f;
const pair = (v,f=[0,0]) => Array.isArray(v) ? [num(v[0],f[0]),num(v[1],f[1])] : f;
const color = v => typeof v==='string'&&/^(#[a-f\d]{3,8}|[a-z]{1,24}|rgba?\([\d.,% ]+\))$/i.test(v)?v:undefined;
const list = (v,max=2000) => Array.isArray(v)?v.slice(0,max):[];
const value = v => typeof v==='object'&&v!==null?safeString(JSON.stringify(v)):typeof v==='string'?safeString(v):typeof v==='boolean'||typeof v==='number'?v:'';
function metadata(v,depth=0){if(depth>6)return null;if(Array.isArray(v))return v.slice(0,100).map(x=>metadata(x,depth+1));if(v&&typeof v==='object')return Object.fromEntries(Object.entries(v).filter(([k])=>!['__proto__','prototype','constructor'].includes(k)).slice(0,100).map(([k,x])=>[safeString(k),metadata(x,depth+1)]));return value(v);}
const nodeProperties=n=>Object.fromEntries(['proxyWidgets','proxyWidgetErrorQuarantine','previewExposures'].filter(k=>n.properties?.[k]!==undefined).map(k=>[k,metadata(n.properties[k])]));
const safeMap = v=>Object.fromEntries(Object.entries(v&&typeof v==='object'?v:{}).filter(([k])=>!['__proto__','prototype','constructor'].includes(k)).slice(0,100).map(([k,v])=>[safeString(k),value(v)]));
const slots = v => list(v,100).map(s=>({name:safeString(s.name),type:safeString(s.type||'*'),label:s.label?safeString(s.label):undefined,link:s.link==null?null:id(s.link),links:Array.isArray(s.links)?s.links.map(id):null,slot_index:num(s.slot_index),shape:num(s.shape),id:s.id==null?undefined:id(s.id),linkIds:Array.isArray(s.linkIds)?s.linkIds.map(id):undefined,widget:s.widget&&typeof s.widget==='object'?{name:safeString(s.widget.name)}:undefined}));
const reroutes = v => list(v).map(r=>({id:id(r.id),parentId:r.parentId==null?undefined:id(r.parentId),pos:pair(r.pos),linkIds:list(r.linkIds).map(id),floating:r.floating&&typeof r.floating==='object'?{slotType:safeString(r.floating.slotType)}:undefined}));
const linkObject = l=>({id:id(l.id),origin_id:id(l.origin_id),origin_slot:num(l.origin_slot),target_id:id(l.target_id),target_slot:num(l.target_slot),type:safeString(l.type),parentId:l.parentId==null?undefined:id(l.parentId),hidden:l.hidden===true,label:typeof l.label==='string'?safeString(l.label):undefined});
export function sanitizeWorkflow(raw,depth=0,budget={nodes:0,subgraphs:0}) {
 if(depth>8)throw Error('Subgraph nesting exceeds safe viewing limit');
 if(!raw||typeof raw!=='object')throw Error('Expected a ComfyUI workflow object');
 if(raw.workflow&&typeof raw.workflow==='object')raw=raw.workflow;
 if(!Array.isArray(raw.nodes)){if(depth)throw Error('Subgraph has no nodes');return apiWorkflow(raw);}
 budget.nodes+=raw.nodes.length; if(budget.nodes>2000)throw Error('Workflow exceeds the 2,000-node viewing limit');
 const legacy=raw.version===0.4||list(raw.links).some(Array.isArray);
 const graph={version:legacy?0.4:1,id:raw.id?id(raw.id):undefined,revision:num(raw.revision),last_node_id:num(raw.last_node_id),last_link_id:num(raw.last_link_id),state:{lastGroupId:num(raw.state?.lastGroupId),lastLinkId:num(raw.state?.lastLinkId),lastNodeId:num(raw.state?.lastNodeId),lastRerouteId:num(raw.state?.lastRerouteId)},config:{},nodes:raw.nodes.map((n,i)=>({id:id(n.id??i+1),type:['__proto__','constructor','prototype','toString','valueOf'].includes(n.type)?'Unknown':safeString(n.type||'Unknown'),title:safeString(n.title||n.type||'Unknown'),pos:pair(n.pos),size:pair(n.size,[280,150]),flags:{collapsed:!!n.flags?.collapsed},mode:4,order:num(n.order),inputs:slots(n.inputs),outputs:slots(n.outputs),properties:nodeProperties(n),widgets_values:list(n.widgets_values,100).map(value),widgets_values_named:safeMap(n.widgets_values_named),color:color(n.color),bgcolor:color(n.bgcolor),boxcolor:color(n.boxcolor)})),links:list(raw.links,10000).map(l=>Array.isArray(l)?[id(l[0]),id(l[1]),num(l[2]),id(l[3]),num(l[4]),safeString(l[5])]:linkObject(l)),floatingLinks:list(raw.floatingLinks,10000).map(linkObject),groups:list(raw.groups).map(g=>({id:num(g.id),title:safeString(g.title),bounding:list(g.bounding,4).map(x=>num(x)),color:color(g.color),font_size:num(g.font_size,24),flags:{}})),reroutes:reroutes(raw.reroutes),extra:{reroutes:reroutes(raw.extra?.reroutes),linkExtensions:list(raw.extra?.linkExtensions).map(x=>({id:id(x.id),parentId:x.parentId==null?undefined:id(x.parentId),hidden:x.hidden===true,label:typeof x.label==='string'?safeString(x.label):undefined}))}};
 if(raw.definitions?.subgraphs){budget.subgraphs+=list(raw.definitions.subgraphs,101).length;if(budget.subgraphs>100)throw Error('Too many subgraphs');}if(raw.definitions?.subgraphs)graph.definitions={subgraphs:list(raw.definitions.subgraphs,100).map(s=>({...sanitizeWorkflow(s,depth+1,budget).graph,name:safeString(s.name),inputs:slots(s.inputs),outputs:slots(s.outputs),inputNode:{id:id(s.inputNode?.id??-10),bounding:list(s.inputNode?.bounding,4).map(x=>num(x))},outputNode:{id:id(s.outputNode?.id??-20),bounding:list(s.outputNode?.bounding,4).map(x=>num(x))}}))};
 return {graph,format:'native',warnings:raw.version>1?['Newer workflow schema: compatibility is not guaranteed.']:[]};
}
function apiWorkflow(raw){
 const entries=Object.entries(raw).filter(([,v])=>v&&typeof v==='object'&&typeof v.class_type==='string');
 if(!entries.length)throw Error('No ComfyUI nodes found');
 if(entries.length>2000)throw Error('Workflow exceeds the 2,000-node viewing limit');
 const ids=new Set(entries.map(([k])=>k)),nodes=[],links=[];
 for(const [index,[key,n]]of entries.entries()){
  const inputs=[],widgets=[]; for(const [name,v]of Object.entries(n.inputs||{}).slice(0,100)){
   if(Array.isArray(v)&&v.length===2&&ids.has(String(v[0]))&&Number.isInteger(v[1])&&v[1]>=0&&v[1]<100){const l=links.length+1;inputs.push({name,type:'*',link:l});links.push([l,String(v[0]),v[1],key,inputs.length-1,'*']);}else widgets.push(`${name}: ${value(v)}`);
  }
  nodes.push({id:key,type:n.class_type,title:n._meta?.title||n.class_type,pos:[(index%4)*360,Math.floor(index/4)*300],size:[290,200],inputs,outputs:[],widgets_values:widgets});
 }
 for(const l of links){const node=nodes.find(n=>n.id===l[1]);while(node.outputs.length<=l[2])node.outputs.push({name:`output ${node.outputs.length}`,type:'*',links:[]});node.outputs[l[2]].links.push(l[0]);}
 const result=sanitizeWorkflow({version:0.4,nodes,links,groups:[]});return {...result,format:'api',warnings:['API graph • auto-layout. Original positions and widget definitions are not present.']};
}
