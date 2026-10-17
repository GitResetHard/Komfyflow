// SPDX-License-Identifier: MIT
// Original Komfyflow graph attachment lifecycle.
import {registerNodeState,unregisterNodeState} from './nodeShellState'
import {useWidgetValueStore} from './widgetValueStore'
import {usePreviewExposureStore,getPreviewExposureHostLocator} from './previewExposureStore'
import {normalizeWidgetsView,refuseAmbiguousNodeWidgets} from '@/lib/litegraph/src/node/widgetsView'
export function attachNodeToStores(graph:any,node:any,mintId:()=>string):void {
 let attempts=0
 while(!registerNodeState(graph,node)){
  if(node._graphScope)throw new Error('Cannot attach a node that is still owned by another graph')
  if(++attempts>1000)throw new Error('Cannot allocate an unused node identity')
  node.id=mintId()
 }
 normalizeWidgetsView(node)
 refuseAmbiguousNodeWidgets(node)
 for(const w of node.widgets??[])w.setNodeId?.(node.id)
 useWidgetValueStore().replaceNodeWidgetOrder(graph.rootGraph.id,node.id,(node.widgets??[]).map((w:any)=>w.widgetId).filter(Boolean))
}
export function detachNodeFromStores(graph:any,node:any,mode:'keep-values'|'discard-values'='keep-values'):void {
 const root=node._graphScope?.rootGraphId??graph.rootGraph.id
 useWidgetValueStore().releaseNodeWidgets(root,node.id,{discardValues:mode==='discard-values'})
 const host=getPreviewExposureHostLocator(node);if(host)usePreviewExposureStore().clearHost(root,host)
 unregisterNodeState(node)
}
export function detachAllNodesFromStores(graph:any):void {
 const owners=[graph,...(graph._subgraphs?.values()??[])]
 const seen=new Set<any>()
 for(const owner of owners)for(const node of owner._nodes??[])if(!seen.has(node)){seen.add(node);detachNodeFromStores(graph,node,'discard-values')}
}
