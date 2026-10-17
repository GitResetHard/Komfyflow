import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ find: vi.fn(), viewer: vi.fn() }));
vi.mock("../../src/lib/server/db", () => ({
  db: { workflow: { findUnique: mocks.find } },
}));
vi.mock("../../src/lib/server/auth", () => ({
  viewer: mocks.viewer,
  requireUser: vi.fn(),
}));
vi.mock("../../src/lib/server/storage", () => ({
  writeObject: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock("../../src/lib/server/analysis-queue", () => ({
  enqueueAnalysis: vi.fn(),
}));
import { allowedWorkflow } from "../../src/lib/server/workflows";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.viewer.mockResolvedValue({ id: undefined, adultOptIn: false });
});
function workflow(statuses: string[]) {
  return {
    id: "workflow",
    authorId: "owner",
    visibility: "PUBLIC",
    adult: false,
    versions: statuses.map((status, index) => ({
      id: `v${index}`,
      status,
      sourceKey: `private-${index}`,
    })),
  };
}
describe("quarantine workflow authorization", () => {
  it.each(["PENDING", "FAILED"])(
    "hides %s-only workflows from guests",
    async (status) => {
      mocks.find.mockResolvedValue(workflow([status]));
      await expect(allowedWorkflow("workflow")).rejects.toMatchObject({
        status: 404,
      });
    },
  );
  it("exposes only READY versions to ordinary readers", async () => {
    mocks.viewer.mockResolvedValue({ id: "reader", adultOptIn: false });
    mocks.find.mockResolvedValue(workflow(["PENDING", "READY", "FAILED"]));
    const result = await allowedWorkflow("workflow");
    expect(result.workflow.versions.map((v) => v.status)).toEqual(["READY"]);
  });
  it("retains pending and failed state for owners to inspect and retry", async () => {
    mocks.viewer.mockResolvedValue({ id: "owner", adultOptIn: false });
    mocks.find.mockResolvedValue(workflow(["PENDING", "FAILED"]));
    const result = await allowedWorkflow("workflow");
    expect(result.workflow.versions.map((v) => v.status)).toEqual([
      "PENDING",
      "FAILED",
    ]);
  });
  it("does not let quarantine-owner exception bypass adult preference", async () => {
    mocks.viewer.mockResolvedValue({ id: "owner", adultOptIn: false });
    mocks.find.mockResolvedValue({ ...workflow(["PENDING"]), adult: true });
    await expect(allowedWorkflow("workflow")).rejects.toMatchObject({
      status: 404,
    });
  });
});
