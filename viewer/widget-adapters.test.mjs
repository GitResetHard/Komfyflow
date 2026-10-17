import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import path from 'node:path';
const root=path.dirname(new URL(import.meta.url).pathname);
const bundle=await build({stdin:{contents:`export * as ids from './adapters/widgetId'; export * as visibility from './adapters/widgetVisibility'; export {useWidgetValueStore} from './adapters/widgetValueStore'; export {useNodeDataStore} from './adapters/nodeDataStore'; export {usePreviewExposureStore,getPreviewExposureHostLocator} from './adapters/previewExposureStore'; export {resolveConcretePromotedWidget,resolveSubgraphInputTarget,parsePreviewExposures,parseProxyWidgetErrorQuarantine} from './adapters/promotedWidgetAdapters'; export {computed} from 'vue'; export {rekeyGraphId} from './adapters/rekeyGraphId'; export {useLinkStore} from './adapters/linkStore'; export {useExecutionOrderStore} from './adapters/executionOrderStore'; export {useGraphMetadataStore} from './adapters/graphMetadataStore';`,resolveDir:root,loader:'ts'},bundle:true,write:false,format:'esm',platform:'node',define:{'process.env.NODE_ENV':'"production"'},logLevel:'silent'});
const {ids,visibility:v,useWidgetValueStore,useNodeDataStore,usePreviewExposureStore,getPreviewExposureHostLocator,resolveConcretePromotedWidget,resolveSubgraphInputTarget,parsePreviewExposures,parseProxyWidgetErrorQuarantine,computed,rekeyGraphId,useLinkStore,useExecutionOrderStore,useGraphMetadataStore}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const init=(value)=>({value,type:'number',options:{}});
test('widget IDs encode each segment and reject empty names',()=>{
 const id=ids.widgetId('graph:a','42','seed:complex%');assert.deepEqual(ids.parseWidgetId(id),{graphId:'graph:a',nodeId:'42',localNodeId:'42',name:'seed:complex%'});assert.equal(ids.isWidgetId(ids.widgetId('a','1','')),false);
 const names=[{name:'seed'},{name:'seed'},{name:'seed#1'}];assert.equal(ids.ensureUniqueWidgetNames(names),true);assert.deepEqual(names.map(w=>w.name),['seed','seed#2','seed#1']);assert.equal(ids.ensureUniqueWidgetNames(names),true);
});
test('duplicate pinned widgets are removed without renaming the authoritative widget',()=>{
 const first={name:'seed'},pinned=Object.freeze({name:'seed'}),list=[first,pinned];const refused=ids.dropUnrenamableDuplicateWidgets(list);assert.deepEqual(list,[first]);assert.equal(refused[0].cause,'duplicate-name');
});
test('widgets are root-scoped, reactive and preserve edited values on rebind',()=>{
 const s=useWidgetValueStore();s.$reset();const a=ids.widgetId('a','1','seed'),b=ids.widgetId('b','1','seed');const state=s.registerWidget(a,init(1));s.registerWidget(b,init(20));const value=computed(()=>s.getWidget(a)?.value);s.setValue(a,null);assert.equal(value.value,null);assert.equal(s.getWidget(b).value,20);assert.equal(s.registerWidget(a,init(500)),state);assert.equal(state.value,null);s.clearGraph('a');assert.equal(s.getWidget(a),undefined);assert.equal(s.getWidget(b).value,20);
});
test('named restoration does not substitute shifted positional values and preserves null',()=>{
 const s=useWidgetValueStore();s.$reset();s.setNodeWidgetRestoration('a','1',{positional:[1,2],named:{second:null},restoreNamed:true});assert.deepEqual(s.getRestoredWidgetValue('a','1','second',0),{value:null});assert.equal(s.getRestoredWidgetValue('a','1','missing',0),undefined);s.setNodeWidgetRestoration('a','1',{positional:[1,undefined],named:{second:2},restoreNamed:false});assert.deepEqual(s.getRestoredWidgetValue('a','1','second',0),{value:1});assert.deepEqual(s.getRestoredWidgetValue('a','1','any',1),{value:undefined});s.clearNodeWidgetRestoration('a','1');assert.equal(s.getRestoredWidgetValue('a','1','second',0),undefined);
});
test('widget order is authoritative and values survive a keep-values detach only',()=>{
 const s=useWidgetValueStore();s.$reset();const a=ids.widgetId('a','1','first'),b=ids.widgetId('a','1','second');s.registerWidget(a,init(7));s.registerWidget(b,init(8));s.replaceNodeWidgetOrder('a','1',[b]);assert.deepEqual(s.getNodeWidgetIds('a','1'),[b]);assert.equal(s.getWidget(a).value,7);s.releaseNodeWidgets('a','1',{discardValues:false});assert.equal(s.getWidget(b),undefined);s.registerWidget(b,init(99));assert.equal(s.getWidget(b).value,8);s.releaseNodeWidgets('a','1',{discardValues:true});s.registerWidget(b,init(99));assert.equal(s.getWidget(b).value,99);
});
test('visibility separates advanced tiers, extension hiding and connected row layout',()=>{
 const visibility=v.deriveWidgetVisibility({type:'number',options:{advanced:true}});assert.equal(v.isWidgetVisibleOnSurface(visibility,'canvas'),true);assert.equal(v.isWidgetVisibleOnSurface(visibility,'panel'),false);visibility.suppression.byConnection=true;assert.equal(v.isWidgetVisibleOnSurface(visibility,'canvas'),false);assert.equal(v.occupiesCanvasRow(visibility),true);v.applyLegacyHiddenWrite(visibility,true);visibility.suppression.byConnection=false;assert.equal(v.occupiesCanvasRow(visibility),false);v.applyLegacyHiddenWrite(visibility,false);assert.equal(v.isWidgetVisibleOnSurface(visibility,'panel',{showAdvanced:true}),true);
});
test('node state reserves identities across subgraphs but not separate root graphs',()=>{
 const s=useNodeDataStore();s.$reset();const make=(id)=>({id,flags:{},properties:{},inputs:[],outputs:[],title:'node'}),scope={rootGraphId:'root',owningGraphId:'child'};const a=s.registerNode(scope,make('1'));assert.ok(a);assert.equal(s.registerNode({rootGraphId:'root',owningGraphId:'other'},make('1')),undefined);assert.ok(s.registerNode({rootGraphId:'other',owningGraphId:'other'},make('1')));const title=computed(()=>s.getGraphNodesFor('root','child')[0]?.title);a.title='renamed';assert.equal(title.value,'renamed');s.rekeyOwner('root','child','newchild');assert.equal(s.getGraphNodesFor('root','child').length,0);assert.equal(s.getGraphNodesFor('root','newchild')[0],a);s.clearOwner({rootGraphId:'root',owningGraphId:'newchild'});assert.equal(s.hasGraph('root'),false);
});
test('preview exposures use root/raw versus subgraph-scoped host locators',()=>{
 const root={id:'root'};root.rootGraph=root;assert.equal(getPreviewExposureHostLocator({id:'1',graph:root}),'1');assert.equal(getPreviewExposureHostLocator({id:'1',graph:{id:'child',rootGraph:root}}),'child:1');const s=usePreviewExposureStore();s.$reset();s.addExposure('root','1',{sourceNodeId:2,sourcePreviewName:'preview'});s.addExposure('root','1',{sourceNodeId:3,sourcePreviewName:'preview'});assert.deepEqual(s.getExposures('root','1').map(e=>e.name),['preview','preview#1']);s.clearGraph('root');assert.deepEqual(s.getExposures('root','1'),[]);
});
test('nested promoted widgets resolve their concrete target without copying values',()=>{
 const widget={name:'seed',value:123},leaf={id:'3',widgets:[widget],inputs:[{widget:{name:'seed'}}]};const graph={inputs:[{name:'input',linkIds:[1]}],getLink:()=>({resolve:()=>({inputNode:leaf,input:leaf.inputs[0]})}),getNodeById:id=>id==='3'?leaf:undefined};const host={id:'2',subgraph:graph};assert.deepEqual(resolveSubgraphInputTarget(host,'input'),{nodeId:'3',widgetName:'seed'});const resolved=resolveConcretePromotedWidget(host,'3','seed');assert.equal(resolved.status,'resolved');assert.equal(resolved.resolved.widget,widget);assert.equal(resolveConcretePromotedWidget(host,'404','seed').failure,'missing-node');
});
test('preview and quarantine parsing rejects malformed records',()=>{
 assert.deepEqual(parsePreviewExposures([{name:'p',sourceNodeId:1,sourcePreviewName:'preview'},{name:'p',sourceNodeId:2,sourcePreviewName:'preview'},{bad:true}]),[{name:'p',sourceNodeId:'1',sourcePreviewName:'preview'}]);assert.equal(parseProxyWidgetErrorQuarantine([{originalEntry:['-1','seed'],hostValue:null},{originalEntry:[]}]).length,1);
});

test('coordinated root rekey preserves widget, node, link and execution state',()=>{
 const root='rekey-old',next='rekey-new',scope={rootGraphId:root,owningGraphId:root};
 const nodes=useNodeDataStore(),widgets=useWidgetValueStore(),links=useLinkStore(),order=useExecutionOrderStore(),metadata=useGraphMetadataStore();
 nodes.registerNode(scope,{id:'9',graphId:root,flags:{},properties:{},inputs:[],outputs:[],title:'rekey'});widgets.registerWidget(ids.widgetId(root,'9','seed'),init(42));links.registerLink(scope,{id:1,graphId:root,originNodeId:'9',originSlot:0,targetNodeId:'10',targetSlot:0,type:'*'});order.set(scope,'9',3);metadata.get(root,root).revision=7;
 assert.equal(rekeyGraphId(root,next,{kind:'root'}),true);assert.equal(nodes.getGraphNodesFor(next,next)[0].title,'rekey');assert.equal(nodes.getGraphNodesFor(root,root).length,0);assert.equal(widgets.getWidget(ids.widgetId(next,'9','seed')).value,42);assert.equal(widgets.getWidget(ids.widgetId(root,'9','seed')),undefined);assert.equal(links.getTopology(next,1).graphId,next);assert.equal(order.get({rootGraphId:next,owningGraphId:next},'9'),3);assert.equal(metadata.get(next,next).revision,7);
});
test('coordinated rekey declines an occupied destination before modifying any store',()=>{
 const nodes=useNodeDataStore(),widgets=useWidgetValueStore();const a='collision-a',b='collision-b';nodes.registerNode({rootGraphId:a,owningGraphId:a},{id:'1',flags:{},properties:{},inputs:[],outputs:[],title:'A'});widgets.registerWidget(ids.widgetId(b,'2','seed'),init(2));assert.equal(rekeyGraphId(a,b,{kind:'root'}),false);assert.equal(nodes.getGraphNodesFor(a,a)[0].title,'A');assert.equal(widgets.getWidget(ids.widgetId(b,'2','seed')).value,2);
});
