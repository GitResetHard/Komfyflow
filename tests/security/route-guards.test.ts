import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  read: vi.fn(),
  db: new Proxy({}, { get: () => new Proxy({}, { get: () => vi.fn() }) }),
}));
vi.mock("../../src/lib/server/db", () => ({ db: mocks.db }));
vi.mock("../../src/lib/server/auth", () => ({
  requireUser: vi.fn(),
  viewer: vi.fn(),
}));
vi.mock("../../src/lib/server/workflows", () => ({
  allowedWorkflow: mocks.allowed,
  serialize: vi.fn(),
  uploadVersion: vi.fn(),
  boundedBytes: vi.fn(),
}));
vi.mock("../../src/lib/server/storage", () => ({
  readObject: mocks.read,
  writeObject: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock("../../src/lib/server/analysis-queue", () => ({
  enqueueAnalysis: vi.fn(),
}));
import { HttpError } from "../../src/lib/server/security";
import { GET as actionGET } from "../../src/app/api/workflows/[id]/[action]/route";
import { GET as examplesGET } from "../../src/app/api/workflows/[id]/examples/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.allowed.mockRejectedValue(
    new HttpError(404, "Workflow not found.", "NOT_FOUND"),
  );
});
describe("every workflow read surface rejects unauthorized content before storage access", () => {
  for (const action of [
    "comments",
    "versions",
    "runs",
    "embed",
    "download",
    "source",
  ])
    it(`guards ${action}`, async () => {
      const response = await actionGET(
        new Request(`https://komfyflow.example/api/workflows/hidden/${action}`),
      );
      expect(response.status).toBe(404);
      expect(mocks.allowed).toHaveBeenCalledWith("hidden");
      expect(mocks.read).not.toHaveBeenCalled();
      expect(await response.json()).toEqual({
        error: "Workflow not found.",
        code: "NOT_FOUND",
      });
    });
  it.each(["", "?image=secret-image"])("guards examples %s", async (query) => {
    const response = await examplesGET(
      new Request(
        `https://komfyflow.example/api/workflows/hidden/examples${query}`,
      ),
    );
    expect(response.status).toBe(404);
    expect(mocks.allowed).toHaveBeenCalledWith("hidden");
    expect(mocks.read).not.toHaveBeenCalled();
  });
});

describe("quarantined versions cannot reach content delivery", () => {
  for (const status of ["PENDING", "FAILED"])
    for (const action of ["download", "source", "embed"])
      it(`blocks ${status} ${action} even with owner workflow access`, async () => {
        mocks.allowed.mockResolvedValue({
          workflow: {
            id: "owned",
            authorId: "owner",
            visibility: "PUBLIC",
            adult: false,
            versions: [
              {
                id: "version",
                status,
                sourceKey: "secret.json",
                preview: { nodes: [] },
              },
            ],
          },
          context: { id: "owner", adultOptIn: false },
        });
        const response = await actionGET(
          new Request(
            `https://komfyflow.example/api/workflows/owned/${action}`,
          ),
        );
        expect(response.status).toBe(409);
        expect(mocks.read).not.toHaveBeenCalled();
      });
});
