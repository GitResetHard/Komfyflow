import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { useLinkStore } from './linkStore';
import { useRerouteStore } from './rerouteStore';
import { useLinkPresentationStore } from './linkPresentationStore';
import { useEntityIdStore } from './entityIdStore';
import { useGraphMetadataStore } from './graphMetadataStore';
import { useExecutionOrderStore } from './executionOrderStore';
import type { GraphScope, LinkTopology } from './topologyTypes';
const scope: GraphScope = { rootGraphId: 'root-a', owningGraphId: 'root-a' };
const child: GraphScope = { rootGraphId: 'root-a', owningGraphId: 'child-a' };
const other: GraphScope = { rootGraphId: 'root-b', owningGraphId: 'root-b' };
const links = useLinkStore(), reroutes = useRerouteStore(), presentation = useLinkPresentationStore();
function topology(id: number, patch: Partial<LinkTopology> = {}): LinkTopology {
  return { id, graphId: 'unregistered', originNodeId: 'source', originSlot: 0,
    targetNodeId: `target-${id}`, targetSlot: 0, type: 'IMAGE', ...patch };
}
beforeEach(() => { for (const store of [links, reroutes, presentation, useEntityIdStore(), useGraphMetadataStore(), useExecutionOrderStore()]) store.$reset(); });
test('registered state is the slot-query source of truth, isolated by root and owner', () => {
  const a = links.registerLink(scope, topology(1))!;
  const b = links.registerLink(child, topology(2))!;
  const c = links.registerLink(other, topology(1))!;
  assert.equal(a.graphId, scope.owningGraphId);
  assert.equal(links.getInputSlotLink(scope, 'target-1', 0), a);
  assert.deepEqual([...links.graphTopologies(child)], [b]);
  assert.equal(links.getTopology('root-b', 1), c);
  assert.equal(links.getTopology(child, 1), undefined);
  assert.deepEqual(links.getOutputSlotLinks(scope, 'source', 0), [a]);
});
test('registration is first-wins by root ID and by connected target', () => {
  const a = links.registerLink(scope, topology(1))!;
  assert.equal(links.registerLink(scope, a), a);
  assert.equal(links.registerLink(child, topology(1)), undefined);
  assert.equal(links.registerLink(scope, topology(2, { targetNodeId: 'target-1' })), undefined);
  assert.equal(links.deleteLink(scope, topology(1)), false);
  assert.equal(links.getInputSlotLink(scope, 'target-1', 0), a);
});
test('endpoint swaps are atomic and preserve object identity', () => {
  const a = links.registerLink(scope, topology(1))!, b = links.registerLink(scope, topology(2))!;
  const revision = links.getRevision();
  const result = links.updateEndpoints(scope, [
    { topology: a, patch: { targetNodeId: 'target-2' } },
    { topology: b, patch: { targetNodeId: 'target-1' } }
  ]);
  assert.equal(result.ok, true);
  assert.equal(links.getInputSlotLink(scope, 'target-2', 0), a);
  assert.equal(links.getInputSlotLink(scope, 'target-1', 0), b);
  assert.equal(links.getRevision(), revision + 1);
});
test('invalid endpoint batches leave links, removals and revisions untouched', () => {
  const a = links.registerLink(scope, topology(1))!, b = links.registerLink(scope, topology(2))!;
  const revision = links.getRevision();
  const result = links.updateEndpoint(scope, a, { targetNodeId: 'target-2' });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.error.code, 'occupied-target');
  assert.equal(a.targetNodeId, 'target-1');
  const duplicate = links.updateEndpoints(scope, [{ topology: a, patch: {} }], [a]);
  assert.equal(duplicate.ok, false);
  assert.equal(links.getRevision(), revision);
  assert.equal(links.getTopology('root-a', 2), b);
});
test('batch removals free slots without leaving stale endpoint indexes', () => {
  const a = links.registerLink(scope, topology(1))!, b = links.registerLink(scope, topology(2))!;
  assert.equal(links.updateEndpoints(scope, [{ topology: a, patch: { targetNodeId: 'target-2' } }], [b]).ok, true);
  assert.equal(links.getTopology('root-a', 2), undefined);
  assert.equal(links.getInputSlotLink(scope, 'target-1', 0), undefined);
  assert.equal(links.getInputSlotLink(scope, 'target-2', 0), a);
});
test('floating links are retained but excluded from connected-slot queries', () => {
  const floating = links.registerLink(scope, topology(1, { targetNodeId: '-1', targetSlot: -1 }))!;
  assert.deepEqual([...links.graphTopologies(scope)], [floating]);
  assert.equal(links.isOutputSlotConnected(scope, 'source', 0), false);
  assert.equal(links.isInputSlotConnected(scope, '-1', -1), false);
  assert.equal(links.updateEndpoint(scope, floating, { targetNodeId: 'assigned', targetSlot: 2 }).ok, true);
  assert.equal(links.isOutputSlotConnected(scope, 'source', 0), true);
  assert.equal(links.getInputSlotLink(scope, 'assigned', 2), floating);
});
test('direct native topology changes invalidate revision and endpoint projections', () => {
  const a = links.registerLink(scope, topology(1))!;
  links.getInputSlotLink(scope, 'target-1', 0);
  const revision = links.getRevision();
  a.targetSlot = 4;
  a.parentId = 7;
  assert.ok(links.getRevision() > revision);
  assert.equal(links.getInputSlotLink(scope, 'target-1', 0), undefined);
  assert.equal(links.getInputSlotLink(scope, 'target-1', 4), a);
});
test('replacement rejects foreign objects and swaps authoritative state', () => {
  const a = links.registerLink(scope, topology(1))!;
  assert.equal(links.replaceLink(scope, topology(1), topology(3)), undefined);
  const next = links.replaceLink(scope, a, topology(3))!;
  assert.equal(links.getTopology('root-a', 1), undefined);
  assert.equal(links.getTopology('root-a', 3), next);
  assert.equal(links.deleteLink(scope, a), false);
});
test('reroute membership follows ancestor chains, floating links and direct parent changes', () => {
  const r1 = reroutes.registerReroute(scope, { id: 10, graphId: '' })!;
  const r2 = reroutes.registerReroute(scope, { id: 11, graphId: '', parentId: 10 })!;
  const normal = links.registerLink(scope, topology(1, { parentId: 11 }))!;
  links.registerLink(scope, topology(2, { parentId: 11, targetNodeId: '-1' }));
  assert.deepEqual([...reroutes.getMembership(scope, 10).linkIds], [1]);
  assert.deepEqual([...reroutes.getMembership(scope, 10).floatingLinkIds], [2]);
  r2.parentId = undefined;
  assert.equal(reroutes.getMembership(scope, 10).linkIds.size, 0);
  r2.parentId = 10; r1.parentId = 11;
  assert.deepEqual([...reroutes.getMembership(scope, 10).linkIds], [1]);
  normal.parentId = undefined;
  assert.equal(reroutes.getMembership(scope, 10).linkIds.size, 0);
  assert.equal(reroutes.getMembership(child, 10).floatingLinkIds.size, 0);
});
test('hidden and labeled link metadata is preserved and scoped independently', () => {
  presentation.patch(scope, 1, { hidden: true, label: 'My conditioning' });
  presentation.patch(child, 1, { label: 'Subgraph label' });
  presentation.patch(scope, 1, { hidden: false });
  assert.deepEqual(presentation.getPresentation(scope, 1), { label: 'My conditioning' });
  assert.deepEqual(presentation.graphHiddenLinkIds(scope), []);
  presentation.patch(scope, 1, { hidden: true });
  assert.deepEqual(presentation.graphHiddenLinkIds(scope), [1]);
  assert.deepEqual(presentation.take(scope, 1), { hidden: true, label: 'My conditioning' });
  assert.equal(presentation.getPresentation(scope, 1), undefined);
  assert.equal(presentation.getPresentation(child, 1)?.label, 'Subgraph label');
});
test('graph rekey preserves links, reroute membership and presentation', () => {
  const nextScope = { rootGraphId: 'renamed', owningGraphId: 'renamed' };
  const a = links.registerLink(scope, topology(1, { parentId: 10 }))!;
  const r = reroutes.registerReroute(scope, { id: 10, graphId: '' })!;
  presentation.patch(scope, 1, { hidden: true, label: 'retained' });
  for (const store of [links, reroutes, presentation]) store.rekeyRoot('root-a', 'renamed');
  assert.equal(a.graphId, 'renamed'); assert.equal(r.graphId, 'renamed');
  assert.equal(links.getTopology('root-a', 1), undefined);
  assert.equal(links.getInputSlotLink(nextScope, 'target-1', 0), a);
  assert.deepEqual([...reroutes.getMembership(nextScope, 10).linkIds], [1]);
  assert.equal(presentation.getPresentation(nextScope, 1)?.label, 'retained');
});
test('owner clear preserves siblings and unregisters mutation watchers', () => {
  const a = links.registerLink(scope, topology(1))!;
  const b = links.registerLink(child, topology(2))!;
  links.clearOwner(scope);
  const revision = links.getRevision(); a.parentId = 10;
  assert.equal(links.getRevision(), revision);
  assert.deepEqual([...links.graphTopologies(child)], [b]);
});
test('metadata, ID counters and execution orders retain their lifecycle semantics', () => {
  const meta = useGraphMetadataStore(), ids = useEntityIdStore(), order = useExecutionOrderStore();
  const data = meta.get('root-a'); data.extra.note = 'retained'; data.revision = 9;
  meta.get('root-a', 'child-a').config.links_ontop = true;
  ids.get('root-a').lastNodeId = 42;
  order.replace(scope, ['n2', 'n1']); order.set(child, 'n1', 8);
  assert.equal(order.get(scope, 'n1'), 1); assert.equal(order.get(child, 'n1'), 8);
  meta.rekeyRoot('root-a', 'renamed'); ids.rekey('root-a', 'renamed'); order.rekeyRoot('root-a', 'renamed');
  assert.equal(meta.get('renamed'), data); assert.equal(ids.get('renamed').lastNodeId, 42);
  assert.equal(meta.get('renamed', 'child-a').config.links_ontop, true);
  assert.equal(order.get({ rootGraphId: 'renamed', owningGraphId: 'renamed' }, 'n1'), 1);
  meta.clear('renamed', 'child-a'); assert.equal(meta.has('renamed', 'child-a'), false);
});
