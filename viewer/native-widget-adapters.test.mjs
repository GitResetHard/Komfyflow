import test from 'node:test';import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';import {build} from 'esbuild';import {nativePlugin} from './resolve.mjs';
const dom=new JSDOM('<!doctype html><html><body></body></html>');
for(const k of ['window','document','Image','HTMLElement','HTMLCanvasElement','CustomEvent','Event','EventTarget','DOMRect','requestAnimationFrame','cancelAnimationFrame'])if(dom.window[k])globalThis[k]=dom.window[k];
globalThis.requestAnimationFrame??=()=>0;globalThis.cancelAnimationFrame??=()=>{};
const ctx=new Proxy({measureText:(s)=>({width:String(s).length*7}),canvas:{}},{get:(o,k)=>k in o?o[k]:()=>{}});dom.window.HTMLCanvasElement.prototype.getContext=()=>ctx;
const b=await build({stdin:{contents:`export {LGraph,LGraphNode,LiteGraph,SubgraphNode} from './vendor/litegraph/src/litegraph';export {useWidgetValueStore} from './adapters/widgetValueStore';export {useNodeDataStore} from './adapters/nodeDataStore';`,resolveDir:new URL('.',import.meta.url).pathname,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',plugins:[nativePlugin()],define:{'import.meta.env.DEV':'false','import.meta.env.PROD':'true','process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const m=await import('data:text/javascript;base64,'+Buffer.from(b.outputFiles[0].text).toString('base64'));
const {LGraph,LGraphNode,LiteGraph}=m;
class WidgetFixture extends LGraphNode {
 constructor(){super('Widget fixture');this.addWidget('number','seed',7,()=>{},{min:0,max:100});this.addWidget('text','prompt','hello',()=>{});this.serialize_widgets=true;}
}
LiteGraph.registerNodeType('komfyflow/widget-fixture',WidgetFixture);
test('native node lifecycle registers live widget values and tears down its state',()=>{
 const g=new LGraph(),n=LiteGraph.createNode('komfyflow/widget-fixture');g.add(n);
 assert.equal(m.useNodeDataStore().getGraphNodesFor(g.id,g.id)[0],n._state);
 assert.deepEqual(n.widgets.map(w=>w.value),[7,'hello']);
 n.widgets[0].value=123;assert.equal(m.useWidgetValueStore().getWidget(n.widgets[0].widgetId).value,123);
 assert.deepEqual(n.serialize().widgets_values_named,{seed:123,prompt:'hello'});
 g.remove(n);assert.equal(m.useNodeDataStore().getGraphNodesFor(g.id,g.id).length,0);assert.deepEqual(m.useWidgetValueStore().getNodeWidgetIds(g.id,n.id),[]);
});
test('native configure restores named values by name, including null',()=>{
 const previous=LiteGraph.namedValuesRestore;LiteGraph.namedValuesRestore=true;
 try {
  const g=new LGraph(),n=LiteGraph.createNode('komfyflow/widget-fixture');g.add(n);
  const payload=g.serialize();payload.nodes[0].widgets_values=[999,'positional'];payload.nodes[0].widgets_values_named={prompt:'named',seed:null};
  g.configure(payload);const restored=g.nodes[0];assert.deepEqual(restored.widgets.map(w=>w.value),[null,'named']);assert.deepEqual(restored.serialize().widgets_values_named,{seed:null,prompt:'named'});g.clear();
 }finally{LiteGraph.namedValuesRestore=previous}
});
test('native duplicate widget names are assigned distinct persistent identities',()=>{
 const g=new LGraph(),n=new LGraphNode('Duplicates');n.addWidget('number','seed',1,()=>{});n.addWidget('number','seed',2,()=>{});g.add(n);assert.deepEqual(n.widgets.map(w=>w.name),['seed','seed#1']);assert.deepEqual(m.useWidgetValueStore().getNodeWidgets(g.id,n.id).map(w=>w.value),[1,2]);g.clear();
});
