import { isRecord } from "./normalize";
import { AnalysisError, LIMITS } from "./types";
const structuralKeys = new Set([
  "id",
  "type",
  "pos",
  "size",
  "flags",
  "order",
  "mode",
  "inputs",
  "outputs",
  "name",
  "label",
  "localized_name",
  "link",
  "links",
  "slot_index",
  "slotIndex",
  "nodeId",
  "node_id",
  "shape",
  "color",
  "bgcolor",
  "boxcolor",
  "title",
  "nodes",
  "groups",
  "bounding",
  "font_size",
  "last_node_id",
  "last_link_id",
  "version",
  "reroutes",
  "parentId",
  "parent_id",
  "linkIds",
  "link_ids",
  "origin_id",
  "origin_slot",
  "target_id",
  "target_slot",
  "originId",
  "originSlot",
  "targetId",
  "targetSlot",
  "linkExtensions",
  "extra",
  "definitions",
  "subgraphs",
  "state",
  "revision",
  "inputNode",
  "outputNode",
  "floating",
  "floatingLinks",
  "hidden",
  "widgets",
  "pinned",
  "showAdvanced",
  "lastNodeId",
  "lastLinkId",
  "lastGroupId",
  "lastRerouteId",
  "widget",
  "direction",
]);
/** Data-only native preview. Keeps graph geometry/topology and bounded widget values.
 * Widgets may contain prompts: previews have exactly the same access policy as originals.
 * Arbitrary executable/extension metadata is removed; every consumer must render values as text.
 */
export function createPreviewGraph(value: unknown): unknown {
  if (!isRecord(value))
    throw new AnalysisError(
      "INVALID_GRAPH",
      "Preview source must be an object.",
    );
  const graph = isRecord(value.workflow)
    ? value.workflow
    : isRecord(value.prompt)
      ? value.prompt
      : value;
  let budget = LIMITS.values;
  function literal(input: unknown, depth = 0): unknown {
    if (--budget < 0 || depth > 32)
      throw new AnalysisError(
        "STRUCTURE_LIMIT",
        "Widget value exceeds preview limits.",
      );
    if (input === null || typeof input === "boolean") return input;
    if (typeof input === "number") return Number.isFinite(input) ? input : null;
    if (typeof input === "string") {
      if (input.length > 65536)
        throw new AnalysisError(
          "STRUCTURE_LIMIT",
          "Widget text exceeds the 64 KiB preview limit.",
        );
      return input;
    }
    if (Array.isArray(input))
      return input.map((value) => literal(value, depth + 1));
    if (!isRecord(input)) return null;
    const output: Record<string, unknown> = Object.create(null);
    for (const [key, value] of Object.entries(input)) {
      if (
        ["__proto__", "prototype", "constructor"].includes(key) ||
        key.length > 512
      )
        throw new AnalysisError("UNSAFE_KEY", "Invalid widget value key.");
      output[key] = literal(value, depth + 1);
    }
    return output;
  }
  function structural(input: unknown, depth = 0): unknown {
    if (--budget < 0 || depth > LIMITS.depth)
      throw new AnalysisError(
        "STRUCTURE_LIMIT",
        "Preview structure is too complex.",
      );
    if (
      input === null ||
      typeof input === "number" ||
      typeof input === "boolean"
    )
      return input;
    if (typeof input === "string") return input.slice(0, 512);
    if (Array.isArray(input)) return input.map((v) => structural(v, depth + 1));
    if (!isRecord(input)) return null;
    const out: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(input)) {
      if (key === "widgets_values" || key === "widgets_values_named") {
        out[key] = literal(item);
        continue;
      }
      if (key === "properties" && isRecord(item)) {
        const supported: Record<string, unknown> = Object.create(null);
        for (const property of [
          "proxyWidgets",
          "proxyWidgetErrorQuarantine",
          "previewExposures",
        ]) {
          if (Object.hasOwn(item, property))
            supported[property] = literal(item[property]);
        }
        if (Object.keys(supported).length) out.properties = supported;
        continue;
      }
      if (structuralKeys.has(key)) out[key] = structural(item, depth + 1);
    }
    return out;
  }
  if (Array.isArray(graph.nodes)) return structural(graph);
  const out: Record<string, unknown> = Object.create(null);
  for (const [id, raw] of Object.entries(graph)) {
    if (!isRecord(raw) || typeof raw.class_type !== "string") continue;
    const inputs: Record<string, unknown> = Object.create(null);
    if (isRecord(raw.inputs))
      for (const [key, v] of Object.entries(raw.inputs)) {
        if (
          Array.isArray(v) &&
          v.length === 2 &&
          (typeof v[0] === "string" || typeof v[0] === "number") &&
          Number.isSafeInteger(v[1])
        )
          inputs[key] = v;
        else inputs[key] = literal(v);
      }
    out[id] = { class_type: raw.class_type, inputs };
  }
  return out;
}
