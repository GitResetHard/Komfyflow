import path from 'node:path';
export const root=path.dirname(new URL(import.meta.url).pathname);
export const nativeRoot=path.join(root,'vendor/litegraph/src');
const direct=['linkStore','rerouteStore','linkPresentationStore','graphMetadataStore','entityIdStore','executionOrderStore','nodeDataStore','widgetValueStore','widgetVisibility','widgetId','previewExposureStore','clearNodeOwnedStoreState','rekeyGraphId','nodeShellState','nodeShellLifecycle','graphLayoutAttachment','layoutStore','slotCalculations','litegraphLinkAdapter','canvasViewport','layoutMutations','arrangeForLegacyRender','layoutMath','linkPolylines','transferLinkPresentation'];
const selection=['selectionStore','selectionState','selectionAdapter','selectionIntent','linkSelectionStore'];
const promoted=['adoptPromotedWidgetValue','resolveConcretePromotedWidget','resolveSubgraphInputTarget','previewExposureSchema','proxyWidgetQuarantineSchema'];
const runtime=['nodeId','linkId','groupId','rerouteId','graphScopeId','linkTopology','nodeIdentification','uuid','assert','pointerUtils','colorUtil','graphTraversalUtil','reportError','cnrIdUtil','subgraphIdSchema','slotColors','useAutoPan','types'];
export const adapters=Object.fromEntries([...direct.map(n=>[n,n]),...selection.map(n=>[n,'selection']),...promoted.map(n=>[n,'promotedWidgetAdapters']),...runtime.map(n=>[n,'runtime'])]);
export function nativePlugin(){return {name:'audited-native-boundary',setup(build){build.onResolve({filter:/^@\//},args=>{
 if(args.path.startsWith('@/lib/litegraph/src/'))return {path:path.join(nativeRoot,args.path.slice('@/lib/litegraph/src/'.length))+'.ts'};
 const name=args.path.split('/').at(-1);const module=args.path==='@/i18n'||args.path==='@/platform/telemetry'?'runtime':adapters[name];
 if(!module)return {errors:[{text:`Unaudited host dependency ${args.path}`}]};return {path:path.join(root,'adapters',module+'.ts')};
 });}};}
