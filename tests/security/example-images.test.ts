import { beforeEach, describe, expect, it, vi } from "vitest";
import sharp from "sharp";
const mocks = vi.hoisted(() => ({
  allowed: vi.fn(),
  user: vi.fn(),
  write: vi.fn(),
  create: vi.fn(),
}));
vi.mock("../../src/lib/server/db", () => ({
  db: { exampleImage: { create: mocks.create } },
}));
vi.mock("../../src/lib/server/auth", () => ({ requireUser: mocks.user }));
vi.mock("../../src/lib/server/workflows", () => ({
  allowedWorkflow: mocks.allowed,
  boundedBytes: async (request: Request) =>
    Buffer.from(await request.arrayBuffer()),
}));
vi.mock("../../src/lib/server/storage", () => ({
  writeObject: mocks.write,
  readObject: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock("../../src/lib/server/security", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../src/lib/server/security")>()),
  rateLimit: vi.fn(async () => undefined),
}));
import { POST } from "../../src/app/api/workflows/[id]/examples/route";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.user.mockResolvedValue({ id: "owner" });
  mocks.allowed.mockResolvedValue({
    workflow: { authorId: "owner", versions: [] },
  });
  mocks.create.mockResolvedValue({ id: "image", caption: "", versionId: null });
});
async function upload(bytes: Uint8Array, name = "example.jpg") {
  const origin = process.env.APP_URL
    ? new URL(process.env.APP_URL).origin
    : "https://komfyflow.example";
  const form = new FormData();
  form.set("file", new File([new Uint8Array(bytes)], name));
  return POST(
    new Request(`${origin}/api/workflows/example/examples`, {
      method: "POST",
      headers: { Origin: origin },
      body: form,
    }),
  );
}
function crc32(buffer: Buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
describe("example image decode and metadata isolation", () => {
  it("strips EXIF while re-encoding to WebP and ignores upload path", async () => {
    const original = await sharp({
      create: { width: 4, height: 4, channels: 3, background: "#ad40de" },
    })
      .withMetadata({
        exif: {
          IFD0: { Artist: "Private Author", Copyright: "Private Information" },
        },
      })
      .jpeg()
      .toBuffer();
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const response = await upload(original, "../../private.jpg");
    expect(response.status).toBe(201);
    expect(mocks.write).toHaveBeenCalledOnce();
    const [key, sanitized] = mocks.write.mock.calls[0];
    expect(key).toMatch(/^examples\/[A-Za-z0-9_-]+\.webp$/);
    expect(Buffer.compare(original, sanitized)).not.toBe(0);
    const metadata = await sharp(sanitized).metadata();
    expect(metadata.format).toBe("webp");
    expect(metadata.exif).toBeUndefined();
    expect(metadata.xmp).toBeUndefined();
    expect(metadata.iptc).toBeUndefined();
    expect(metadata.icc).toBeUndefined();
    expect(mocks.create.mock.calls[0][0].data.contentType).toBe("image/webp");
  });
  it("rejects signature-only counterfeit JPEG before writing storage", async () => {
    const response = await upload(Buffer.from([255, 216, 255, 0, 0, 0]));
    expect(response.status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("rejects PNG dimension bomb before writing storage", async () => {
    const png = await sharp({
      create: { width: 1, height: 1, channels: 3, background: "#000000" },
    })
      .png()
      .toBuffer();
    png.writeUInt32BE(100000, 16);
    png.writeUInt32BE(100000, 20);
    png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
    const response = await upload(png, "huge.png");
    expect(response.status).toBe(400);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("rejects non-owner before storing any content", async () => {
    mocks.user.mockResolvedValue({ id: "other" });
    const response = await upload(Buffer.from("anything"));
    expect(response.status).toBe(403);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});
