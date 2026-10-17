import {
  AnalysisError,
  LIMITS,
  type NormalizedWorkflow,
  type NormalizedNode,
  type NormalizedLink,
} from "./types";
export const isRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const idOf = (v: unknown): string | undefined =>
  (typeof v === "string" && v.length > 0 && v.length <= 256) ||
  (typeof v === "number" && Number.isSafeInteger(v))
    ? String(v)
    : undefined;
function invalid(message: string): never {
  throw new AnalysisError("INVALID_GRAPH", message);
}
export function normalizeWorkflow(
  value: unknown,
  depth = 0,
): NormalizedWorkflow {
  if (depth > LIMITS.depth)
    throw new AnalysisError(
      "STRUCTURE_LIMIT",
      "Nested subgraphs exceed supported depth.",
    );
  if (!isRecord(value)) invalid("Workflow must be a JSON object.");
  // Some exporters wrap an API graph as {prompt: {...}} or a UI graph as {workflow: {...}}.
  if (!Array.isArray(value.nodes) && isRecord(value.workflow))
    value = value.workflow;
  else if (!Array.isArray(value.nodes) && isRecord(value.prompt))
    value = value.prompt;
  const graph = value as Record<string, unknown>;
  const ui = Array.isArray(graph.nodes);
  const warnings: string[] = [],
    nodes: NormalizedNode[] = [],
    links: NormalizedLink[] = [];
  const ids = new Set<string>();
  const entries: Array<[unknown, unknown]> = ui
    ? (graph.nodes as unknown[]).map((n) => [isRecord(n) ? n.id : undefined, n])
    : Object.entries(graph);
  if (entries.length > LIMITS.nodes)
    throw new AnalysisError("NODE_LIMIT", "Workflow contains too many nodes.");
  for (const [rawId, raw] of entries) {
    if (!isRecord(raw)) invalid("Every node must be an object.");
    const id = idOf(rawId);
    const type = ui ? raw.type : raw.class_type;
    if (!id || typeof type !== "string" || !type.trim() || type.length > 512)
      invalid("Every node needs a valid ID and node type.");
    if (ids.has(id)) invalid("Workflow contains duplicate node IDs.");
    ids.add(id);
    const inputs: Record<string, unknown> = Object.create(null);
    if (!ui) {
      if (!isRecord(raw.inputs)) invalid("API node inputs must be an object.");
      for (const [key, item] of Object.entries(raw.inputs)) {
        if (key.length > 512)
          invalid("Node input names exceed supported length.");
        if (
          Array.isArray(item) &&
          item.length === 2 &&
          idOf(item[0]) !== undefined &&
          Number.isSafeInteger(item[1]) &&
          Number(item[1]) >= 0
        )
          links.push({
            fromNode: String(item[0]),
            fromOutput: Number(item[1]),
            toNode: id,
            toInput: key,
          });
        else inputs[key] = item;
      }
    }
    if (ui && isRecord(raw.widgets_values_named)) {
      for (const [key, item] of Object.entries(raw.widgets_values_named)) {
        if (
          key.length > 512 ||
          ["__proto__", "prototype", "constructor"].includes(key)
        )
          invalid("Invalid named widget key.");
        inputs[key] = item;
      }
    }
    const titleValue =
      typeof raw.title === "string"
        ? raw.title
        : isRecord(raw._meta) && typeof raw._meta.title === "string"
          ? raw._meta.title
          : undefined;
    const title = titleValue?.slice(0, 512);
    nodes.push({
      id,
      type,
      inputs,
      widgets: Array.isArray(raw.widgets_values) ? raw.widgets_values : [],
      ...(title ? { title } : {}),
    });
  }
  if (!nodes.length) invalid("Workflow contains no nodes.");
  if (ui) {
    if (graph.links !== undefined && !Array.isArray(graph.links))
      invalid("UI workflow links must be an array.");
    for (const rawLink of (graph.links as unknown[] | undefined) ?? []) {
      const link = isRecord(rawLink)
        ? [
            rawLink.id,
            rawLink.origin_id ?? rawLink.originId,
            rawLink.origin_slot ?? rawLink.originSlot,
            rawLink.target_id ?? rawLink.targetId,
            rawLink.target_slot ?? rawLink.targetSlot,
            rawLink.type,
          ]
        : rawLink;
      if (
        !Array.isArray(link) ||
        link.length < 5 ||
        idOf(link[1]) === undefined ||
        idOf(link[3]) === undefined ||
        !Number.isSafeInteger(link[2]) ||
        Number(link[2]) < 0 ||
        !Number.isSafeInteger(link[4]) ||
        Number(link[4]) < 0
      )
        invalid("UI workflow contains an invalid link.");
      links.push({
        fromNode: String(link[1]),
        fromOutput: Number(link[2]),
        toNode: String(link[3]),
        toInput: String(link[4]),
      });
    }
  }
  if (links.length > LIMITS.links)
    throw new AnalysisError("LINK_LIMIT", "Workflow contains too many links.");
  const dangling = links.filter(
    (l) => !ids.has(l.fromNode) || !ids.has(l.toNode),
  ).length;
  if (dangling) warnings.push(`${dangling} link(s) reference a missing node.`);
  if (!ui)
    warnings.push(
      "API graph: editor positions, groups, and widget layouts are unavailable.",
    );
  if (
    ui &&
    isRecord(graph.definitions) &&
    Array.isArray(graph.definitions.subgraphs)
  ) {
    for (const [index, subgraph] of graph.definitions.subgraphs.entries()) {
      if (
        !isRecord(subgraph) ||
        !Array.isArray(subgraph.nodes) ||
        !subgraph.nodes.length
      )
        continue;
      const nested = normalizeWorkflow(subgraph, depth + 1);
      const prefix = `subgraph:${String(subgraph.id ?? index)}:`;
      nodes.push(...nested.nodes.map((n) => ({ ...n, id: prefix + n.id })));
      links.push(
        ...nested.links.map((l) => ({
          ...l,
          fromNode: prefix + l.fromNode,
          toNode: prefix + l.toNode,
        })),
      );
      if (nodes.length > LIMITS.nodes || links.length > LIMITS.links)
        throw new AnalysisError(
          "STRUCTURE_LIMIT",
          "Expanded subgraph structure exceeds supported limits.",
        );
      warnings.push(...nested.warnings.map((w) => `${prefix} ${w}`));
    }
    if (nodes.length > LIMITS.nodes || links.length > LIMITS.links)
      throw new AnalysisError(
        "STRUCTURE_LIMIT",
        "Expanded subgraph structure exceeds supported limits.",
      );
  }
  return { sourceKind: ui ? "ui" : "api", nodes, links, warnings };
}
