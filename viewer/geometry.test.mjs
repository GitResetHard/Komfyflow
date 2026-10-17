import { build } from 'esbuild'
import { nativePlugin } from './resolve.mjs'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import { JSDOM } from 'jsdom'
const root = path.dirname(fileURLToPath(import.meta.url))
const bundle = await build({ stdin: { contents: `export * from './adapters/graphLayoutAttachment';export {layoutStore} from './adapters/layoutStore';export * from './adapters/slotCalculations';export * from './adapters/litegraphLinkAdapter';export * from './adapters/canvasViewport';export * from './adapters/arrangeForLegacyRender';export * from './adapters/layoutMutations';export * from './adapters/layoutMath';export * from './adapters/linkPolylines';export {registerLiteGraphInstance} from './vendor/litegraph/src/litegraphInstance';`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', plugins: [nativePlugin()], logLevel: 'silent' })
const m = await import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'))
m.registerLiteGraphInstance({ NODE_SLOT_HEIGHT: 20, NODE_TITLE_HEIGHT: 30, NODE_COLLAPSED_WIDTH: 80, vueNodesMode: false })
function graph(id) { const g = { id, _nodes: [], isRootGraph: true }; g.rootGraph = g; return g }
function node(id) { return { id, flags: {}, inputs: [], outputs: [], constructor: {}, get pos() { return m.nodePositionView(this) }, set pos(value) { m.setNodePosition(this, value) }, get size() { return m.nodeSizeView(this) }, set size(value) { m.setNodeSize(this, value) }, get renderingSize() { return this.flags.collapsed ? [this._collapsed_width ?? 80, 0] : m.refreshNodeGeometry(this) } } }
function attached(root = 'root', id = '1') { const g = graph(root), n = node(id); n.graph = g; g._nodes.push(n); m.attachNodeLayout(g, n); return { g, n } }
test('geometry store isolates roots and keeps stable read/write node views', () => {
  const { n } = attached('stable-a'), { n: other } = attached('stable-b')
  const position = n.pos, size = n.size
  m.layoutStore.batchUpdateNodeBounds('stable-a', [{ nodeId: '1', bounds: { x: 100, y: 200, width: 300, height: 90 } }])
  position[0] = 500; size[1] = 120
  assert.equal(n.pos, position); assert.equal(n.size, size)
  assert.deepEqual([...n.pos], [500, 200]); assert.deepEqual([...n.size], [300, 120])
  assert.deepEqual([...other.pos], [10, 10])
  assert.deepEqual(m.layoutStore.getNodeLayout('stable-a', '1').bounds, { x: 500, y: 200, width: 300, height: 120 })
})
test('content measurement never overwrites serialized size and explicit resize supersedes measurement', () => {
  const { n } = attached('content'); n.size = [300, 120]
  m.layoutStore.reportContentSize('content', '1', { width: 450, height: 200 })
  assert.deepEqual(n.renderingSize, [450, 200]); assert.deepEqual([...n.size], [300, 120])
  n.pos = [501, 200]; assert.deepEqual(n.renderingSize, [450, 200])
  n.size = [301, 121]; assert.deepEqual(n.renderingSize, [301, 121])
})
test('root and owner rekeys preserve attached geometry; detached writes do not resurrect layouts', () => {
  const { g, n } = attached('old-root')
  m.layoutStore.rekeyRoot('old-root', 'new-root'); g.id = 'new-root'
  m.layoutStore.rekeyOwner('new-root', 'old-root', 'new-root')
  n.pos = [20, 30]
  assert.deepEqual(m.layoutStore.getNodeLayout('new-root', '1').position, { x: 20, y: 30 })
  assert.equal(m.layoutStore.hasGraph('old-root'), false)
  assert.equal(m.layoutStore.hasOwner('new-root', 'new-root'), true)
  m.detachNodeLayout(n); n.pos = [4, 5]
  assert.equal(m.layoutStore.getNodeLayout('new-root', '1'), null)
  m.attachNodeLayout(g, n); assert.deepEqual([...n.pos], [4, 5])
})
test('native slot constants, explicit slots, compact rows, collapsed ports and hit tests agree', () => {
  const { g, n } = attached('slots'); n.pos = [4, 5]; n.size = [301, 121]
  n.inputs = [{ name: 'a', pos: [5, 20] }, { name: 'b' }, { name: 'c' }]; n.outputs = [{ name: 'd' }]
  assert.deepEqual(m.getSlotPosition(n, 0, true), [9, 25]); assert.deepEqual(m.getSlotPosition(n, 1, true), [14, 19]); assert.deepEqual(m.getSlotPosition(n, 2, true), [14, 39]); assert.deepEqual(m.getSlotPosition(n, 0, false), [296, 19])
  assert.equal(m.getSlotLayoutAtPoint(g, { x: 14, y: 39 }).index, 2)
  n.flags.collapsed = true; assert.deepEqual(m.getSlotPosition(n, 0, false), [84, -10])
})
test('native render order respects front/back mutations without rewriting graph nodes', () => {
  const { g, n } = attached('order'), second = node('2'); second.graph = g; g._nodes.push(second); m.attachNodeLayout(g, second)
  assert.deepEqual(m.nodesInRenderOrder(g).map(n => n.id), ['1', '2'])
  m.useLayoutMutations().setNodeOrder(g, n.id, 'front')
  assert.deepEqual(m.nodesInRenderOrder(g).map(n => n.id), ['2', '1'])
  assert.deepEqual(g._nodes.map(n => n.id), ['1', '2'])
})
test('original line geometry handles curves, orthogonal routing, reroute controls and backward overshoot', () => {
  const spline = m.buildConnectionGeometry([0, 0], [200, 100], 4, 3, 2)
  assert.equal(spline.curved, true); assert.ok(spline.points.length > 3)
  assert.deepEqual(spline.points[0], { x: 0, y: 0 }); assert.deepEqual(spline.points.at(-1), { x: 200, y: 100 })
  const elbow = m.buildConnectionGeometry([0, 0], [200, 100], 4, 3, 1)
  assert.ok(elbow.points.every((p, i, all) => !i || p.x === all[i - 1].x || p.y === all[i - 1].y))
  const routed = m.buildConnectionGeometry([0, 0], [200, 100], 5, 5, 2, { startControl: [0, 60], endControl: [0, -60] })
  assert.deepEqual(routed.control1, { x: 0, y: 60 }); assert.deepEqual(routed.control2, { x: 200, y: 40 })
  const backward = m.buildConnectionGeometry([200, 0], [0, 0], 4, 3, 2)
  assert.ok(backward.points.some(p => p.x > 200)); assert.ok(backward.points.some(p => p.x < 0))
})
test('path rendering caches hit geometry, uses native reroute segment ownership and clears hidden lines', () => {
  class Path { ops = []; moveTo(...args) { this.ops.push(['move', ...args]) } lineTo(...args) { this.ops.push(['line', ...args]) } bezierCurveTo(...args) { this.ops.push(['curve', ...args]) } }
  globalThis.Path2D = Path
  const calls = [], ctx = new Proxy({ globalAlpha: 1 }, { get(object, key) { return key in object ? object[key] : (...args) => calls.push([key, ...args]) } })
  const adapter = new m.LitegraphLinkAdapter(false), link = { id: 1, type: 'MODEL', _pos: [0, 0] }, reroute = { id: 7, _pos: [0, 0] }
  const context = { renderMode: 2, connectionWidth: 3, renderBorder: true, lowQuality: false, highQualityRender: true, scale: 1, linkMarkerShape: 1, renderConnectionArrows: true, highlightedLinks: new Set(), defaultLinkColor: '#aaa', linkTypeColors: { MODEL: '#abc' } }
  adapter.renderLinkDirect(ctx, [0, 0], [200, 100], link, false, 0, null, 4, 3, context, { reroute })
  assert.ok(reroute.path.ops.some(op => op[0] === 'curve')); assert.equal(link.path, undefined)
  assert.ok(calls.filter(op => op[0] === 'stroke').length >= 2); assert.ok(m.getLinkPolyline(reroute).length > 2)
  assert.equal(m.layoutStore.getLinkLayout(reroute).rerouteId, 7)
  adapter.renderLinkDirect(ctx, [0, 0], [200, 100], link, false, 0, null, 4, 3, { ...context, renderMode: -1 }, { reroute })
  assert.equal(reroute.path, undefined); assert.equal(m.getLinkPolyline(reroute), undefined)
})
test('marquee geometry intersects edges and negative extents without false positives', () => {
  assert.equal(m.polylineIntersectsBounds([{ x: -10, y: 0 }, { x: 10, y: 0 }], { x: 2, y: 2, width: -4, height: -4 }), true)
  assert.equal(m.polylineIntersectsBounds([{ x: -10, y: 8 }, { x: 10, y: 8 }], { x: -2, y: -2, width: 4, height: 4 }), false)
  assert.equal(m.polylineIntersectsBounds([], { x: 0, y: 0, width: 1, height: 1 }), false)
})
test('DPR viewport keeps logical pixels separate from both physical backing stores', () => {
  const viewport = m.measureViewport(501, 301, 2); assert.equal(viewport.physicalWidth, 1002)
  let measured
  const transforms = []
  const host = { ds: { setViewportSize: (...size) => { measured = size } } }, canvas = { width: 0, height: 0, style: {}, getContext: () => ({setTransform: (...v) => transforms.push(v)}) }, background = { width: 0, height: 0, getContext: () => ({setTransform: (...v) => transforms.push(v)}) }
  m.applyViewport(viewport, canvas, background, host)
  assert.deepEqual(transforms, [[2,0,0,2,0,0],[2,0,0,2,0,0]])
  m.applyViewport(viewport, canvas, background, host)
  assert.deepEqual(transforms.slice(2), [[2,0,0,2,0,0],[2,0,0,2,0,0]], 'repeat apply replaces transform rather than accumulating scale')
  assert.deepEqual(measured, [501, 301]); assert.equal(background.height, 602); assert.equal(host.dpr, 2)
  m.applyLogicalCanvasStyle(canvas, 501, 301); assert.equal(canvas.style.width, '501px')
  assert.equal(m.measureViewport(100, 100, Number.NaN).dpr, 1)
})
test('real native node/group/reroute lifecycles keep detached coordinates and migrate root caches', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.Image = dom.window.Image
  for (const key of ['Event', 'CustomEvent', 'EventTarget', 'AbortController', 'AbortSignal']) globalThis[key] = dom.window[key]
  const native = await build({ stdin: { contents: `export * from './vendor/litegraph/src/litegraph';export {layoutStore} from './adapters/layoutStore';`, resolveDir: root, loader: 'ts' }, bundle: true, write: false, format: 'esm', platform: 'node', plugins: [nativePlugin()], define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true', 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent' })
  const temp = await mkdtemp(path.join(os.tmpdir(), 'komfyflow-geometry-'))
  const entry = path.join(temp, 'native.mjs'); await writeFile(entry, native.outputFiles[0].text)
  const { LGraph, LGraphNode, LGraphGroup, Reroute, layoutStore } = await import(pathToFileURL(entry).href)
  await rm(temp, { recursive: true, force: true })
  const graph = new LGraph(), node = new LGraphNode('native'), group = new LGraphGroup('group')
  graph.add(node); graph.add(group)
  const reroute = new Reroute(1, graph, [10, 20]); graph._addReroute(reroute)
  layoutStore.applyOperation({ type: 'setGroupBounds', graphId: graph.id, groupId: group.id, position: { x: 40, y: 60 }, size: { width: 300, height: 150 } })
  group.pos[0] = 50
  assert.deepEqual(layoutStore.getGroupLayout(graph.id, group.id).position, { x: 50, y: 60 })
  const oldRoot = graph.id, migratedRoot = '8c3cb125-6500-4e17-a75f-262f6e607888'
  layoutStore.rekeyRoot(oldRoot, migratedRoot)
  layoutStore.applyOperation({ type: 'moveReroute', graphId: migratedRoot, rerouteId: reroute.id, position: { x: 70, y: 80 } })
  assert.deepEqual([...reroute.pos], [70, 80])
  reroute.pos[0] = 90
  assert.deepEqual(layoutStore.getRerouteLayout(migratedRoot, reroute.id).position, { x: 90, y: 80 })
  layoutStore.rekeyRoot(migratedRoot, oldRoot)
  graph.remove(group); assert.deepEqual([...group.pos], [50, 60]); assert.equal(layoutStore.getGroupLayout(graph.id, group.id), null)
  graph._removeReroute(reroute.id); assert.deepEqual([...reroute.pos], [90, 80]); assert.equal(layoutStore.getRerouteLayout(graph.id, reroute.id), null)
  node.pos = [100, 200]; graph.remove(node); node.pos[1] = 300
  assert.deepEqual([...node.pos], [100, 300]); assert.equal(layoutStore.getNodeLayout(graph.id, node.id), null)
})
