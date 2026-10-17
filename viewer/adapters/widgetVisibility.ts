// SPDX-License-Identifier: MIT
// Original Komfyflow visibility policy for the native canvas host.
export const WIDGET_SURFACES = ['canvas','vueNode','panel'] as const
export type WidgetSurface = typeof WIDGET_SURFACES[number]
export type WidgetSurfaceTier = 'shown'|'advanced'|'never'
export type WidgetSurfaces = Record<WidgetSurface,WidgetSurfaceTier>
export interface WidgetVisibilityComponent { surfaces:WidgetSurfaces; suppression:{byExtension:boolean;byConnection:boolean} }
export interface WidgetVisibilitySource { type?:string;hidden?:boolean;advanced?:boolean;connectionSuppressed?:boolean;options?:any }
export function isLegacyHiddenWidgetType(type?:string|null):boolean { return !!type && (/hidden/i.test(type) || /^tschide/i.test(type)) }
export function isLegacyWidgetHidingType(type?:string|null):boolean { return isLegacyHiddenWidgetType(type) || /^converted-widget(?::|$)/.test(type??'') }
export function deriveWidgetSurfaces(source:WidgetVisibilitySource):WidgetSurfaces {
  const o=source.options??{}
  const declared=o.surfaces
  if(declared && WIDGET_SURFACES.every(s=>['shown','advanced','never'].includes(declared[s]))) return {...declared}
  const standard:WidgetSurfaceTier=(o.advanced??source.advanced)?'advanced':'shown'
  return {canvas:source.advanced?'advanced':'shown',vueNode:o.canvasOnly?'never':standard,panel:o.hideInPanel||o.canvasOnly?'never':standard}
}
export function deriveWidgetVisibility(source:WidgetVisibilitySource):WidgetVisibilityComponent {
  return {surfaces:deriveWidgetSurfaces(source),suppression:{byExtension:!!(source.hidden || source.options?.hidden || isLegacyHiddenWidgetType(source.type)),byConnection:source.connectionSuppressed===true}}
}
function tierVisible(t:WidgetSurfaceTier, view:{showAdvanced?:boolean}) { return t==='shown'||(t==='advanced'&&!!view.showAdvanced) }
export function isWidgetVisibleOnSurface(v:WidgetVisibilityComponent,s:WidgetSurface,view={showAdvanced:false}):boolean { return !v.suppression.byExtension&&!v.suppression.byConnection&&tierVisible(v.surfaces[s],view) }
export function occupiesCanvasRow(v:WidgetVisibilityComponent,view={showAdvanced:false}):boolean { return !v.suppression.byExtension&&tierVisible(v.surfaces.canvas,view) }
export function isWidgetHidden(v:WidgetVisibilityComponent):boolean { return v.suppression.byExtension||v.suppression.byConnection||WIDGET_SURFACES.every(s=>v.surfaces[s]==='never') }
export function isWidgetHiddenInPanel(v:WidgetVisibilityComponent):boolean { return v.surfaces.panel==='never' }
export function isWidgetAdvanced(v:WidgetVisibilityComponent):boolean { return WIDGET_SURFACES.some(s=>v.surfaces[s]==='advanced') }
export function setWidgetHiddenInPanel(v:WidgetVisibilityComponent,hidden:boolean):void { v.surfaces.panel=hidden?'never':v.surfaces.vueNode==='advanced'?'advanced':'shown' }
export function setWidgetAdvanced(v:WidgetVisibilityComponent,advanced:boolean,surfaces:readonly WidgetSurface[]=WIDGET_SURFACES):void { for(const s of surfaces) if(v.surfaces[s]!=='never') v.surfaces[s]=advanced?'advanced':'shown' }
export function applyLegacyHiddenWrite(v:WidgetVisibilityComponent,hidden:boolean):void { v.suppression.byExtension=hidden===true }
export function applyLegacyCanvasOnlyWrite(v:WidgetVisibilityComponent,source:WidgetVisibilitySource):void { const s=deriveWidgetSurfaces(source);v.surfaces.vueNode=s.vueNode;v.surfaces.panel=s.panel }
export function applyLegacyAdvancedWrite(v:WidgetVisibilityComponent,advanced:boolean|undefined,registered:boolean):void { setWidgetAdvanced(v,advanced===true,registered?['canvas']:WIDGET_SURFACES) }
