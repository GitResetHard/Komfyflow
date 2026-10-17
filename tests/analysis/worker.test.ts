import { beforeEach, describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
const mocks = vi.hoisted(() => ({
  find: vi.fn(),
  versionUpdate: vi.fn(),
  runCreate: vi.fn(),
  runUpdate: vi.fn(),
  transaction: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({
  db: {
    workflowVersion: { findUnique: mocks.find, update: mocks.versionUpdate },
    analysisRun: { create: mocks.runCreate, update: mocks.runUpdate },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/server/storage", () => ({ readObject: mocks.read }));
import { processAnalysis } from "../../src/worker/process";
const data = Buffer.from(
  JSON.stringify({ "1": { class_type: "Example", inputs: {} } }),
);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.find.mockResolvedValue({
    id: "v",
    sourceKey: "private/key",
    originalName: "x.json",
    sha256: createHash("sha256").update(data).digest("hex"),
    status: "PENDING",
  });
  mocks.read.mockResolvedValue(data);
  mocks.runCreate.mockResolvedValue({ id: "run" });
  mocks.transaction.mockResolvedValue([]);
});
describe("analysis job processing", () => {
  it("stores immutable report history and current result together", async () => {
    await processAnalysis({ data: { versionId: "v" } });
    expect(mocks.runCreate).toHaveBeenCalledWith({
      data: { versionId: "v", status: "PENDING", progress: 0, stage: "queued" },
    });
    expect(mocks.versionUpdate.mock.calls[0][0].data.status).toBe("READY");
    expect(
      mocks.runUpdate.mock.calls.at(-1)![0].data.analysis.schemaVersion,
    ).toBe("1.0");
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(
      mocks.runUpdate.mock.calls.map((call) => [
        call[0].data.stage,
        call[0].data.progress,
      ]),
    ).toEqual([
      ["reading", 10],
      ["analyzing", 35],
      ["storing", 90],
      ["complete", 100],
    ]);
  });
  it("rejects tampered immutable sources without retrying deterministic failures", async () => {
    mocks.read.mockResolvedValue(Buffer.from("{}"));
    await processAnalysis({ data: { versionId: "v" } });
    expect(mocks.versionUpdate.mock.calls[0][0].data.status).toBe("FAILED");
    expect(mocks.runUpdate.mock.calls.at(-1)![0].data.error).toContain(
      "INVALID_GRAPH",
    );
  });
  it("checks checksum of valid but changed graph", async () => {
    mocks.read.mockResolvedValue(
      Buffer.from('{"2":{"class_type":"Other","inputs":{}}}'),
    );
    await processAnalysis({ data: { versionId: "v" } });
    expect(mocks.runUpdate.mock.calls.at(-1)![0].data.error).toContain(
      "INTEGRITY_MISMATCH",
    );
  });
  it("redacts infrastructure errors and throws for retry", async () => {
    mocks.read.mockRejectedValue(new Error("credential secret"));
    await expect(processAnalysis({ data: { versionId: "v" } })).rejects.toThrow(
      "credential secret",
    );
    expect(JSON.stringify(mocks.runUpdate.mock.calls)).not.toContain(
      "credential secret",
    );
    expect(
      mocks.runUpdate.mock.calls.map((call) => call[0].data.stage),
    ).toEqual(["reading", "failed"]);
    expect(mocks.runUpdate.mock.calls.at(-1)![0].data).not.toHaveProperty(
      "progress",
    );
  });
  it("does not reprocess completed or deleted versions", async () => {
    mocks.find.mockResolvedValue(null);
    await processAnalysis({ data: { versionId: "v" } });
    expect(mocks.read).not.toHaveBeenCalled();
    mocks.find.mockResolvedValue({ status: "READY" });
    await processAnalysis({ data: { versionId: "v" } });
    expect(mocks.runCreate).not.toHaveBeenCalled();
  });
});
