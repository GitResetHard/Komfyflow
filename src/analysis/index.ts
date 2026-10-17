import { createHash } from "node:crypto";
import {
  DEFAULT_REGISTRY,
  REGISTRY_PROVENANCE,
  MODEL_WIDGET_FIELDS,
} from "./registry";
import { extractWorkflow } from "./extract";
import { normalizeWorkflow } from "./normalize";
import {
  REPORT_SCHEMA_VERSION,
  AnalysisError,
  type AnalysisReport,
  type RegistryEntry,
  type Dependency,
  type ModelReference,
} from "./types";
export * from "./types";
export { extractWorkflow, normalizeWorkflow };
const modelField =
  /(?:^|_)(?:ckpt|checkpoint|model|lora|vae|controlnet|unet|clip|diffusion_model)(?:_name\d*|_path|_file)?$/i;
const modelExtension = /\.(?:safetensors|ckpt|pt|pth|bin|gguf|onnx)$/i;
const safeURL = (s?: string): string | undefined => {
  if (!s) return;
  try {
    const u = new URL(s);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href
      : undefined;
  } catch {
    return;
  }
};
export function analyzeWorkflow(
  input: Uint8Array,
  filename: string,
  registry: RegistryEntry[] = DEFAULT_REGISTRY,
): AnalysisReport {
  const graph = normalizeWorkflow(extractWorkflow(input, filename));
  const dependencies: Dependency[] = [];
  const index = new Map<string, RegistryEntry[]>();
  for (const entry of registry)
    for (const type of new Set(entry.nodeTypes)) {
      const bucket = index.get(type) ?? [];
      const identity = entry.repository ?? entry.packageName;
      if (
        !bucket.some(
          (existing) =>
            (existing.repository ?? existing.packageName) === identity,
        )
      )
        bucket.push(entry);
      index.set(type, bucket);
    }
  for (const type of new Set(graph.nodes.map((n) => n.type))) {
    const matches = index.get(type) ?? [];
    const base = {
      nodeType: type,
      nodeIds: graph.nodes.filter((n) => n.type === type).map((n) => n.id),
    };
    if (matches.length === 1) {
      const match = matches[0];
      const repository = safeURL(match.repository);
      dependencies.push({
        ...base,
        status: match.verified ? "verified" : "inferred",
        packageName: match.packageName,
        ...(repository ? { repository } : {}),
        ...(match.version ? { version: match.version } : {}),
        evidence:
          match.source ||
          (match.verified
            ? "Exact node mapping in the supplied verified registry snapshot."
            : "Exact node mapping in an unverified registry snapshot; installation identity needs review."),
      });
    } else if (matches.length > 1)
      dependencies.push({
        ...base,
        status: "unresolved",
        candidates: [...new Set(matches.map((m) => m.packageName))],
        evidence:
          "Multiple registry packages claim this node type; no package was selected.",
      });
    else
      dependencies.push({
        ...base,
        status: "unresolved",
        evidence:
          "No exact match in the supplied registry snapshot. Node name alone does not establish a package or repository.",
      });
  }
  const models: ModelReference[] = [];
  for (const node of graph.nodes) {
    const candidates = [
      ...Object.entries(node.inputs),
      ...node.widgets.map((v, i): [string, unknown] => [
        MODEL_WIDGET_FIELDS[node.type]?.[i] ?? `widgets_values[${i}]`,
        v,
      ]),
    ];
    for (const [field, value] of candidates) {
      if (
        typeof value !== "string" ||
        !value.trim() ||
        (!modelField.test(field) &&
          !(field.startsWith("widgets_values[") && modelExtension.test(value)))
      )
        continue;
      if (/^(?:none|null|undefined|auto|default)$/i.test(value)) continue;
      if (value.length > 4096 || models.length >= 10000)
        throw new AnalysisError(
          "MODEL_LIMIT",
          "Model references exceed supported limits.",
        );
      const unsafe =
        /^(?:[a-z]+:|[\\/])/i.test(value) ||
        /(?:^|[\\/])\.\.(?:[\\/]|$)/.test(value) ||
        /[\x00-\x1f]/.test(value);
      if (models.some(model => model.nodeId === node.id && model.field === field && model.filename === value)) continue;
      models.push({
        nodeId: node.id,
        field,
        filename: value,
        status: "inferred",
        pathSafety: unsafe ? "unsafe" : "relative",
        detection: field.startsWith("widgets_values[")
          ? "extension-heuristic"
          : Object.hasOwn(node.inputs, field)
            ? "named-input"
            : "known-widget",
        evidence:
          "Model-like workflow value only. File identity, license, hash, availability, and download source are not verified.",
      });
    }
  }
  if (models.some((m) => m.pathSafety === "unsafe"))
    graph.warnings.push(
      "Model references include absolute paths, traversal, or URLs. They are display-only and must not be resolved or fetched.",
    );
  graph.warnings.push(
    "Static analysis only. Node implementations were not executed; runtime compatibility and required versions are not established.",
  );
  // Reports are safe to serialize to the public detail UI: literal prompts and arbitrary
  // node configuration is omitted from this report. The separately gated preview preserves
  // bounded widget values, and originals remain immutable.
  const reportGraph = {
    ...graph,
    nodes: graph.nodes.map((node) => ({
      ...node,
      inputs: {},
      widgets: node.widgets.map(() => null),
    })),
  };
  return {
    ...reportGraph,
    schemaVersion: REPORT_SCHEMA_VERSION,
    analyzerVersion: "0.3.0",
    registrySnapshots: registry === DEFAULT_REGISTRY ? REGISTRY_PROVENANCE : [],
    originalSha256: createHash("sha256").update(input).digest("hex"),
    filename,
    dependencies,
    models,
    summary: {
      nodeCount: graph.nodes.length,
      linkCount: graph.links.length,
      unresolvedDependencies: dependencies.filter(
        (d) => d.status === "unresolved",
      ).length,
      modelCount: models.length,
    },
  };
}
export { createPreviewGraph } from "./preview";
