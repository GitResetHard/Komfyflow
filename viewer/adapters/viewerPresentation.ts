/** Inspection-only presentation policy for the pinned native canvas. */
export function configureReadOnlyPresentation(view: any): void {
  view.read_only = true;
  view.allow_interaction = false;
  view.allow_dragnodes = false;
  view.allow_dragcanvas = true;
  // Native editor LOD hides all titles/widgets below 8 physical pixels. A preview
  // must still identify nodes at Fit; users can zoom for comfortable reading.
  view.min_font_size_for_lod = 0;
  view.render_info = false;
  // Nodes use actual NEVER execution mode (2), not BYPASS (4). The native editor
  // dims NEVER nodes to 0.4; that is an editor execution-state affordance, not a
  // useful read-only display. Keep native colors/text at normal preview opacity.
  // This method name is part of the audited pinned runtime, covered by draw tests.
  Object.defineProperty(view, 'getNodeModeAlpha', { value: () => 1, configurable: true });
}
