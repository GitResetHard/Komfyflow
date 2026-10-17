import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import {
  analyzeWorkflow,
  extractWorkflow,
  AnalysisError,
  LIMITS,
} from "../../src/analysis";
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url));
const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
function crc32(buffer: Buffer) {
  let c = 0xffffffff;
  for (const b of buffer) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, body: Buffer) {
  const out = Buffer.alloc(body.length + 12);
  out.writeUInt32BE(body.length);
  out.write(type, 4);
  body.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, -4)), out.length - 4);
  return out;
}
function png(metadata: Buffer, type = "tEXt") {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk(type, metadata),
    chunk("IDAT", deflateSync(Buffer.from([0, 0, 0, 0, 0]))),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const api = {
  "1": {
    class_type: "ExampleLoader",
    inputs: { model_name: "models/a.safetensors" },
  },
};
describe("static workflow analysis", () => {
  it("normalizes an API graph with connections and model filenames", () => {
    const r = analyzeWorkflow(fixture("basic-api.json"), "api.json", []);
    expect(r.sourceKind).toBe("api");
    expect(r.nodes).toHaveLength(7);
    expect(r.links).toHaveLength(9);
    expect(r.models[0].filename).toBe("sd_xl_base_1.0.safetensors");
    expect(r.originalSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(r.dependencies.every((d) => d.status === "unresolved")).toBe(true);
  });
  it("normalizes a UI graph and preserves unknown node identity", () => {
    const r = analyzeWorkflow(fixture("basic-ui.json"), "ui.json");
    expect(r.nodes).toHaveLength(3);
    expect(r.links[0]).toEqual({
      fromNode: "1",
      fromOutput: 0,
      toNode: "2",
      toInput: "0",
    });
    expect(r.models).toHaveLength(2);
  });
  it("distinguishes verified, inferred, and ambiguous registry entries", () => {
    const r = analyzeWorkflow(fixture("basic-ui.json"), "ui.json", [
      {
        nodeTypes: ["CheckpointLoaderSimple"],
        packageName: "comfy-core",
        verified: true,
        source: "pinned snapshot",
      },
      { nodeTypes: ["KSampler"], packageName: "candidate", verified: false },
      { nodeTypes: ["UnknownCustomNode"], packageName: "a", verified: true },
      { nodeTypes: ["UnknownCustomNode"], packageName: "b", verified: true },
    ]);
    expect(r.dependencies.map((d) => d.status)).toEqual([
      "verified",
      "inferred",
      "unresolved",
    ]);
    expect(r.dependencies[2].packageName).toBeUndefined();
  });
  it("does not infer download URLs or execute supplied strings", () => {
    const r = analyzeWorkflow(
      bytes({
        "1": {
          class_type: "eval(process.exit())",
          inputs: {
            model_name: "../../private/model.ckpt",
            code: "process.exit(1)",
          },
        },
      }),
      "x.json",
    );
    expect(r.models[0].pathSafety).toBe("unsafe");
    expect(r.dependencies[0].repository).toBeUndefined();
    expect(r.models[0]).not.toHaveProperty("downloadUrl");
  });
  it("supports wrapped API graphs", () =>
    expect(
      analyzeWorkflow(bytes({ prompt: api }), "x.json").nodes,
    ).toHaveLength(1));
  it("rejects duplicate IDs, empty graphs, malformed input, unsafe keys and oversized inputs", () => {
    for (const source of [
      Buffer.from("{"),
      Buffer.from('{"__proto__":{}}'),
      bytes({}),
      bytes({
        nodes: [
          { id: 1, type: "A" },
          { id: 1, type: "B" },
        ],
      }),
    ])
      expect(() => extractOrAnalyze(source)).toThrow(AnalysisError);
    expect(() => extractWorkflow(Buffer.alloc(LIMITS.fileBytes + 1))).toThrow(
      /size/,
    );
  });
  it("bounds nested structures", () => {
    let value: unknown = 0;
    for (let i = 0; i < 100; i++) value = { x: value };
    expect(() => extractWorkflow(bytes(value))).toThrow(/complex/);
  });
  it("warns rather than inventing missing nodes", () => {
    const r = analyzeWorkflow(
      bytes({ "1": { class_type: "A", inputs: { x: ["missing", 0] } } }),
      "x.json",
    );
    expect(r.warnings.join(" ")).toMatch(/missing node/);
  });
});
function extractOrAnalyze(input: Buffer) {
  return analyzeWorkflow(input, "bad.json");
}
describe("bounded PNG metadata", () => {
  it("reads workflow tEXt", () =>
    expect(
      extractWorkflow(
        png(Buffer.concat([Buffer.from("workflow\0"), bytes(api)])),
      ),
    ).toEqual(api));
  it("reads prompt zTXt", () =>
    expect(
      extractWorkflow(
        png(
          Buffer.concat([Buffer.from("prompt\0\0"), deflateSync(bytes(api))]),
          "zTXt",
        ),
      ),
    ).toEqual(api));
  it("reads compressed iTXt", () =>
    expect(
      extractWorkflow(
        png(
          Buffer.concat([
            Buffer.from("workflow\0\x01\0\0\0"),
            deflateSync(bytes(api)),
          ]),
          "iTXt",
        ),
      ),
    ).toEqual(api));
  it("rejects decompression bombs", () =>
    expect(() =>
      extractWorkflow(
        png(
          Buffer.concat([
            Buffer.from("workflow\0\0"),
            deflateSync(Buffer.alloc(LIMITS.metadataBytes + 1, 32)),
          ]),
          "zTXt",
        ),
      ),
    ).toThrow(/decompression/));
  it("rejects invalid CRC and truncation", () => {
    const file = png(Buffer.concat([Buffer.from("workflow\0"), bytes(api)]));
    const corrupt = Buffer.from(file);
    corrupt[40] ^= 1;
    expect(() => extractWorkflow(corrupt)).toThrow();
    expect(() => extractWorkflow(file.subarray(0, -3))).toThrow();
  });
  it("rejects missing workflow metadata", () =>
    expect(() => extractWorkflow(png(Buffer.from("other\0text")))).toThrow(
      /does not contain/,
    ));
});

describe("registry and data-only preview", () => {
  it("deduplicates repeated claims for a single repository", () => {
    const report = analyzeWorkflow(bytes(api), "a.json", [
      {
        packageName: "one",
        repository: "https://example.com/pkg",
        nodeTypes: ["ExampleLoader"],
        verified: false,
      },
      {
        packageName: "alias",
        repository: "https://example.com/pkg",
        nodeTypes: ["ExampleLoader"],
        verified: false,
      },
    ]);
    expect(report.dependencies[0].status).toBe("inferred");
  });
  it("has pinned provenance and does not claim runtime compatibility", () => {
    const report = analyzeWorkflow(
      bytes({
        "1": {
          class_type: "CheckpointLoaderSimple",
          inputs: { ckpt_name: "test.safetensors" },
        },
      }),
      "a.json",
    );
    expect(report.registrySnapshots).toHaveLength(2);
    expect(report.registrySnapshots.every((s) => s.sha256.length === 64)).toBe(
      true,
    );
    expect(report.warnings.join(" ")).toContain("runtime compatibility");
  });
  it("preserves widget values and geometry while stripping arbitrary properties", async () => {
    const { createPreviewGraph } = await import("../../src/analysis");
    const out = createPreviewGraph({
      nodes: [
        {
          id: 1,
          type: "Loader",
          widgets_values: ["secret"],
          properties: { password: "secret" },
        },
      ],
      groups: [{ title: "Group", bounding: [0, 0, 100, 100] }],
      extra: { reroutes: [{ id: 4, pos: [1, 2], linkIds: [1] }] },
      definitions: { subgraphs: [{ id: "g", nodes: [], links: [] }] },
    }) as any;
    expect(out.nodes[0].widgets_values).toEqual(["secret"]);
    expect(out.nodes[0].properties).toBeUndefined();
    expect(out.groups).toHaveLength(1);
    expect(out.extra.reroutes).toHaveLength(1);
    expect(out.definitions.subgraphs).toHaveLength(1);
    expect(JSON.stringify(out)).not.toContain("password");
  });
  it("preserves API literals and connections as inert data", async () => {
    const { createPreviewGraph } = await import("../../src/analysis");
    const out = createPreviewGraph({
      "1": { class_type: "A", inputs: { text: "secret", model: ["2", 0] } },
    }) as any;
    expect(out["1"].inputs.text).toBe("secret");
    expect(out["1"].inputs.model).toEqual(["2", 0]);
  });
});
it("does not publish raw prompts or arbitrary credential values in reports", () => {
  const report = analyzeWorkflow(
    bytes({
      "1": {
        class_type: "A",
        inputs: { text: "private prompt", api_key: "private key" },
      },
    }),
    "a.json",
    [],
  );
  expect(JSON.stringify(report)).not.toContain("private prompt");
  expect(JSON.stringify(report)).not.toContain("private key");
});
it("normalizes native object links and analyzes nested subgraph nodes", () => {
  const r = analyzeWorkflow(
    bytes({
      nodes: [
        { id: 1, type: "A" },
        { id: 2, type: "B" },
      ],
      links: [
        { id: 1, origin_id: 1, origin_slot: 0, target_id: 2, target_slot: 0 },
      ],
      definitions: {
        subgraphs: [
          {
            id: "nested",
            nodes: [
              {
                id: 1,
                type: "NestedLoader",
                widgets_values: ["nested.safetensors"],
              },
            ],
            links: [],
          },
        ],
      },
    }),
    "native.json",
    [],
  );
  expect(r.links[0].toNode).toBe("2");
  expect(r.nodes[2].id).toBe("subgraph:nested:1");
  expect(r.models[0].filename).toBe("nested.safetensors");
});
it("reads the on-disk PNG workflow fixture", () => {
  const r = analyzeWorkflow(
    fixture("workflow-metadata.png"),
    "workflow-metadata.png",
    [],
  );
  expect(r.sourceKind).toBe("ui");
  expect(r.nodes).toHaveLength(3);
});
it("does not mistake a prompt ending in a model extension for a model input", () => {
  const r = analyzeWorkflow(
    bytes({
      "1": {
        class_type: "CLIPTextEncode",
        inputs: { text: "a private portrait named secret.safetensors" },
      },
    }),
    "x.json",
    [],
  );
  expect(r.models).toHaveLength(0);
  expect(JSON.stringify(r)).not.toContain("private portrait");
});
describe("aggregate recursive resource budgets", () => {
  it("rejects total nodes over the limit across individually valid subgraphs", () => {
    const sub = (id: string) => ({
      id,
      nodes: Array.from({ length: 6000 }, (_, i) => ({ id: i, type: "A" })),
      links: [],
    });
    expect(() =>
      analyzeWorkflow(
        bytes({
          nodes: [{ id: 1, type: "Root" }],
          links: [],
          definitions: { subgraphs: [sub("a"), sub("b")] },
        }),
        "large.json",
        [],
      ),
    ).toThrow(/Expanded subgraph/);
  });
  it("rejects oversized input names and model paths", () => {
    expect(() =>
      analyzeWorkflow(
        bytes({
          "1": { class_type: "A", inputs: { ["k".repeat(600)]: ["2", 0] } },
        }),
        "x.json",
        [],
      ),
    ).toThrow(/input names/);
    expect(() =>
      analyzeWorkflow(
        bytes({
          "1": {
            class_type: "Loader",
            inputs: { model_name: "a".repeat(5000) + ".safetensors" },
          },
        }),
        "x.json",
        [],
      ),
    ).toThrow(/Model references/);
  });
  it("truncates display titles without copying prompt-sized strings into reports", () => {
    const r = analyzeWorkflow(
      bytes({
        nodes: [{ id: 1, type: "A", title: "x".repeat(5000) }],
        links: [],
      }),
      "x.json",
      [],
    );
    expect(r.nodes[0].title).toHaveLength(512);
  });
  it("rejects cyclic subgraph structures passed directly to normalization", async () => {
    const { normalizeWorkflow } = await import("../../src/analysis");
    const graph: any = {
      nodes: [{ id: 1, type: "A" }],
      definitions: { subgraphs: [] },
    };
    graph.definitions.subgraphs.push(graph);
    expect(() => normalizeWorkflow(graph)).toThrow(/depth/);
  });
});
