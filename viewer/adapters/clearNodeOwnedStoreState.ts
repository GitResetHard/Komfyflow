// SPDX-License-Identifier: MIT
// Original Komfyflow per-node teardown, separate from shell ownership.
import {useWidgetValueStore} from './widgetValueStore'
import {usePreviewExposureStore,getPreviewExposureHostLocator} from './previewExposureStore'
export function clearNodeOwnedStoreState(node:any):void {
 const root=node._graphScope?.rootGraphId??node.graph?.rootGraph.id
 if(!root)return
 useWidgetValueStore().clearNode(root,node.id)
 const host=getPreviewExposureHostLocator(node);if(host)usePreviewExposureStore().clearHost(root,host)
}
