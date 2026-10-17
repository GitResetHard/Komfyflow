// SPDX-License-Identifier: MIT
// Original Komfyflow coordinated identity migration. Validate before mutating.
import {useNodeDataStore} from './nodeDataStore'
import {useWidgetValueStore} from './widgetValueStore'
import {usePreviewExposureStore} from './previewExposureStore'
import {rekeyNodeScopes} from './nodeShellState'
import {useLinkStore} from './linkStore'
import {useLinkPresentationStore} from './linkPresentationStore'
import {useRerouteStore} from './rerouteStore'
import {useExecutionOrderStore} from './executionOrderStore'
import {useGraphMetadataStore} from './graphMetadataStore'
import {useEntityIdStore} from './entityIdStore'
import {layoutStore} from './layoutStore'
import {useSelectionStore} from './selection'
export function rekeyGraphId(previousId:string,nextId:string,owner:{kind:'root'}|{kind:'subgraph';rootGraphId:string}):boolean {
 if(previousId===nextId)return true
 const nodes=useNodeDataStore(),widgets=useWidgetValueStore(),previews=usePreviewExposureStore()
 const scoped=[nodes,useLinkStore(),useLinkPresentationStore(),useRerouteStore(),useExecutionOrderStore(),useGraphMetadataStore()] as any[]
 const selection=useSelectionStore() as any
 if(owner.kind==='root'){
  const stores=[...scoped,widgets,previews,useEntityIdStore(),layoutStore,selection]
  if(stores.some(s=>s.hasGraph?.(nextId)))return false
  const targetOwner={rootGraphId:previousId,owningGraphId:nextId}
  if(scoped.some(s=>s.hasOwner?.(targetOwner))||layoutStore.hasOwner(previousId,nextId)||selection.hasOwner?.(targetOwner))return false
  for(const s of stores)s.rekeyRoot?.(previousId,nextId)
  rekeyNodeScopes(previousId,nextId)
 }else{
  const root=owner.rootGraphId,scope={rootGraphId:root,owningGraphId:nextId}
  if(scoped.some(s=>s.hasOwner?.(scope))||layoutStore.hasOwner(root,nextId)||selection.hasOwner?.(scope))return false
  for(const s of [...scoped,previews,layoutStore,selection])s.rekeyOwner?.(root,previousId,nextId)
  rekeyNodeScopes(previousId,nextId,root)
 }
 return true
}
