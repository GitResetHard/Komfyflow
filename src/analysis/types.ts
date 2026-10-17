export const REPORT_SCHEMA_VERSION = "1.0" as const;
export type EvidenceStatus = "verified" | "inferred" | "unresolved";
export interface RegistryEntry {
  nodeTypes: string[];
  packageName: string;
  repository?: string;
  version?: string;
  verified: boolean;
  source?: string;
}
export interface NormalizedNode {
  id: string;
  type: string;
  inputs: Record<string, unknown>;
  widgets: unknown[];
  title?: string;
}
export interface NormalizedLink {
  fromNode: string;
  fromOutput: number;
  toNode: string;
  toInput: string;
}
export interface NormalizedWorkflow {
  sourceKind: "ui" | "api";
  nodes: NormalizedNode[];
  links: NormalizedLink[];
  warnings: string[];
}
export interface Dependency {
  nodeType: string;
  nodeIds: string[];
  status: EvidenceStatus;
  packageName?: string;
  repository?: string;
  version?: string;
  evidence: string;
  candidates?: string[];
}
export interface ModelReference {
  nodeId: string;
  field: string;
  filename: string;
  status: "inferred";
  evidence: string;
  pathSafety: "relative" | "unsafe";
  detection: "named-input" | "known-widget" | "extension-heuristic";
}
export interface AnalysisReport extends NormalizedWorkflow {
  schemaVersion: typeof REPORT_SCHEMA_VERSION;
  analyzerVersion: string;
  registrySnapshots: Array<{
    snapshotId: string;
    retrievedAt: string;
    source: string;
    sha256: string;
  }>;
  originalSha256: string;
  filename: string;
  dependencies: Dependency[];
  models: ModelReference[];
  summary: {
    nodeCount: number;
    linkCount: number;
    unresolvedDependencies: number;
    modelCount: number;
  };
}
export class AnalysisError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AnalysisError";
  }
}
export const LIMITS = {
  fileBytes: 20 * 1024 * 1024,
  metadataBytes: 4 * 1024 * 1024,
  pngChunks: 10000,
  nodes: 10000,
  links: 50000,
  depth: 80,
  values: 300000,
  stringLength: 1024 * 1024,
} as const;
