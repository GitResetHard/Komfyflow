/** Original CSS-pixel/backing-store sizing bridge. */
export interface CanvasViewport { width: number; height: number; logicalWidth: number; logicalHeight: number; physicalWidth: number; physicalHeight: number; dpr: number }
export function readBrowserDpr(): number { const ratio = typeof window === 'undefined' ? 1 : window.devicePixelRatio; return Number.isFinite(ratio) && ratio > 0 ? ratio : 1 }
export function measureViewport(width: number, height: number, dpr = readBrowserDpr()): CanvasViewport {
  width = Number.isFinite(width) ? Math.max(0, width) : 0
  height = Number.isFinite(height) ? Math.max(0, height) : 0
  dpr = Number.isFinite(dpr) && dpr > 0 ? dpr : 1
  return { width, height, logicalWidth: width, logicalHeight: height, physicalWidth: Math.round(width * dpr), physicalHeight: Math.round(height * dpr), dpr }
}
export function applyLogicalCanvasStyle(canvas: HTMLCanvasElement, width: number, height: number): boolean {
  if (!canvas.style) return false
  canvas.style.width = `${Math.max(0, width)}px`
  canvas.style.height = `${Math.max(0, height)}px`
  return false
}
export function applyViewport(viewport: CanvasViewport, canvas: HTMLCanvasElement, background: HTMLCanvasElement | null, host: any): void {
  for (const target of new Set([canvas, background])) {
    if (!target) continue
    if (target.width !== viewport.physicalWidth) target.width = viewport.physicalWidth
    if (target.height !== viewport.physicalHeight) target.height = viewport.physicalHeight
    // Resizing clears Canvas2D state. Native front rendering uses logical pixels
    // (including background drawImage), so re-establish an absolute DPR transform
    // on both contexts. setTransform, not scale, also handles repeat/DPR-only calls.
    target.getContext('2d')?.setTransform(viewport.dpr, 0, 0, viewport.dpr, 0, 0)
  }
  host.dpr = viewport.dpr
  host.ds?.setViewportSize(viewport.logicalWidth, viewport.logicalHeight)
  host.dirty_canvas = true
  host.dirty_bgcanvas = true
}
