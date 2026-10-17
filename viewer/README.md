# Current native ComfyUI workflow viewer

This viewer vendors the current Comfy-Org native canvas and node engine from `Comfy-Org/ComfyUI_frontend` at immutable commit `a8e134a988495b2e22979458b41f561083cb5d5b`, under `src/lib/litegraph`. The source carries MIT licensing. Native canvas, nodes, slots, groups, reroutes, and subgraphs are retained. Connection-line rendering and the application-state bridge are original Komfyflow implementations, as requested.

## Architecture and license boundary

Current upstream delegates graph state, geometry, widget restoration and connection drawing to application modules outside the MIT subtree. We do not silently bundle those GPL-covered application implementations. `resolve.mjs` maps supported host interfaces to original files in `adapters/`; unknown host imports fail the build. There is no alias fallback to the upstream application directory. The exact shipped native source hashes are recorded in `vendor-manifest.json`. Upstream copyright and license notices are retained unchanged.

Original host adapters maintain scoped node/widget state, topology indexes and revisions, graph metadata, link presentation, reroute-chain membership, selection state and geometry. They are not blanket no-op substitutes. Editor-only edge autopan is disabled because all editing is disabled; read-only manual panning remains native. `litegraphLinkAdapter.ts` supplies original connection rendering through the native canvas's host interface rather than replacing the native canvas/node renderer.

Bundled third-party dependencies: Vue, es-toolkit and DOMPurify, with their respective notices. Dependencies are installed through the root npm workspace. No remote runtime import or CDN dependency is used.

## Build and integration

From repository root: `npm ci`, then `node viewer/build.mjs`. Run `node --test viewer/*.test.mjs` for tests. The build emits a self-contained `public/viewer/index.html` and license notices. The application imports default `WorkflowViewer` from `@/components/workflow-viewer`, with `{workflow: unknown, className?: string}`.

Pass a bounded server-generated native preview, not the simplified analysis graph. The security allowlist retains UI graph geometry, node colors, groups, links, reroutes, floating links, hidden/labeled-link presentation, positional/named widget values and bounded native subgraph metadata. Uploaded widget values are shown as text placeholders; no custom extension or DOM widget code is loaded. API-only graphs are explicitly labelled auto-layout because API exports have no original canvas positions.

## Security

The iframe uses `sandbox="allow-scripts"` without same-origin, forms, popups or navigation permissions. Hash-only script/style CSP denies all external network, font, media, frame, worker and object sources and eval. Images permit only data URLs used by fixed bundled native SVG icons; uploaded image/URL fields are stripped. Host messages require the exact frame window, opaque origin and per-frame random token; the child verifies its parent and token. Wildcard postMessage delivery is needed for the opaque origin, not used as an identity check.

Arbitrary callback, URL, extension and configuration properties never reach native configure. Uploaded objects are reconstructed through a bounded allowlist; prototype keys are rejected. Nodes are forced into the native NEVER execution mode. The inspection presentation policy keeps full display opacity and disables editor LOD text suppression so titles remain drawn at Fit zoom; native node colors remain unchanged. No graph start, queue, object_info fetch, model execution or extension loader exists. Paste, drop, editor menus, keyboard mutation and double-click editor paths are disabled. Native panning/zooming and safe text inspection remain available.

## Validation

The 54 tests exercise the actual current native engine against original host adapters, not just a simplified normalized graph. They cover state isolation, topology, named widget restoration, low-zoom title drawing, actual NEVER mode, graph colors, reroutes and high-DPI canvas compositing. Real Chromium desktop/mobile browser journeys and cross-origin embedding pass in [CI run 39077826957](https://github.com/GitResetHard/Komfyflow/actions/runs/39077826957); downloaded desktop and mobile screenshots were inspected. This establishes the included fixtures, not universal pixel-perfect custom extension compatibility. See ../docs/verification.md for exact scope and external deployment gates.
