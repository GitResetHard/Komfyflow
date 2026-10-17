import { describe, expect, it } from "vitest";
import { createPreviewGraph, analyzeWorkflow } from "../../src/analysis";
const encode = (value: unknown) => Buffer.from(JSON.stringify(value));
describe("current native preview fidelity and safety", () => {
  it("preserves named and positional widget values as inert data, including markup and URLs", () => {
    const graph = {
      version: 1,
      nodes: [
        {
          id: "1",
          type: "CheckpointLoaderSimple",
          pos: [12, 34],
          size: [240, 180],
          widgets_values: ["model.safetensors", 42],
          widgets_values_named: {
            ckpt_name: "model.safetensors",
            prompt: "<script>alert(1)</script>",
            url: "javascript:alert(1)",
          },
          properties: { onExecute: "evil()", proxyWidgets: [["2", "seed"]] },
          extensions: { unsafe: true },
        },
      ],
      links: [],
    };
    const out = createPreviewGraph(graph) as typeof graph;
    expect(out.nodes[0].widgets_values).toEqual(graph.nodes[0].widgets_values);
    expect(out.nodes[0].widgets_values_named).toEqual(
      graph.nodes[0].widgets_values_named,
    );
    expect(out.nodes[0].properties).toEqual({ proxyWidgets: [["2", "seed"]] });
    expect(out.nodes[0].extensions).toBeUndefined();
  });
  it("keeps current labeled/hidden links, floating links, reroutes and graph counters", () => {
    const graph = {
      version: 1,
      state: { lastNodeId: 2, lastLinkId: 5, lastGroupId: 1, lastRerouteId: 3 },
      nodes: [{ id: 1, type: "A" }],
      links: [
        {
          id: 5,
          origin_id: 1,
          origin_slot: 0,
          target_id: 2,
          target_slot: 0,
          type: "MODEL",
          label: "Model",
          hidden: true,
        },
      ],
      floatingLinks: [
        {
          id: 6,
          origin_id: 1,
          origin_slot: 0,
          target_id: -1,
          target_slot: 0,
          type: "MODEL",
        },
      ],
      reroutes: [
        {
          id: 3,
          pos: [10, 20],
          linkIds: [5],
          floating: { nodeId: 1, slotIndex: 0 },
        },
      ],
    };
    const out = createPreviewGraph(graph) as typeof graph;
    expect(out.links).toEqual(graph.links);
    expect(out.floatingLinks).toEqual(graph.floatingLinks);
    expect(out.state).toEqual(graph.state);
  });
  it("analyzes named-only model values but keeps literal values out of reports and deduplicates named/positional values", () => {
    const report = analyzeWorkflow(
      encode({
        nodes: [
          {
            id: 1,
            type: "CheckpointLoaderSimple",
            widgets_values: ["model.safetensors"],
            widgets_values_named: {
              ckpt_name: "model.safetensors",
              text: "not-a-model",
            },
          },
        ],
        links: [],
      }),
      "named.json",
    );
    expect(report.models).toHaveLength(1);
    expect(report.models[0].filename).toBe("model.safetensors");
    expect(report.nodes[0].inputs).toEqual({});
    expect(report.analyzerVersion).toBe("0.3.0");
  });
  it("rejects oversized widget strings and poisoned named value keys", () => {
    expect(() =>
      createPreviewGraph({
        nodes: [{ id: 1, type: "A", widgets_values: ["a".repeat(65537)] }],
        links: [],
      }),
    ).toThrow("64 KiB");
    expect(() =>
      createPreviewGraph(
        JSON.parse(
          '{"nodes":[{"id":1,"type":"A","widgets_values_named":{"__proto__":{"polluted":true}}}],"links":[]}',
        ),
      ),
    ).toThrow("Invalid widget value key");
  });
});
