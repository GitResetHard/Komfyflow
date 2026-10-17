import { describe, expect, it } from "vitest";
import { deflateSync } from "node:zlib";
import { extractWorkflow, parseBoundedJson } from "../../src/analysis/extract";
import { LIMITS } from "../../src/analysis/types";
function crc32(bytes: Buffer) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, body: Buffer) {
  const raw = Buffer.concat([Buffer.from(type), body]);
  const size = Buffer.alloc(4);
  size.writeUInt32BE(body.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(raw));
  return Buffer.concat([size, raw, crc]);
}
function png(metadata: Buffer, type = "tEXt") {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(1, 0);
  header.writeUInt32BE(1, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", header),
    chunk(type, metadata),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
describe("hostile workflow input", () => {
  it.each(["__proto__", "constructor", "prototype"])(
    "rejects reserved key %s before object transformation",
    (key) => {
      expect(() =>
        parseBoundedJson(Buffer.from(`{"safe":{"${key}":{"polluted":true}}}`)),
      ).toThrow("reserved object key");
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    },
  );
  it("rejects nesting deeper than parser budget", () => {
    expect(() =>
      parseBoundedJson(
        Buffer.from(
          "[".repeat(LIMITS.depth + 2) + "0" + "]".repeat(LIMITS.depth + 2),
        ),
      ),
    ).toThrow("too complex");
  });
  it("rejects invalid UTF-8 instead of replacing bytes", () => {
    expect(() =>
      parseBoundedJson(Buffer.from([0x22, 0xc0, 0x80, 0x22])),
    ).toThrow("UTF-8 JSON");
  });
  it("rejects oversized JSON before parsing", () => {
    expect(() =>
      parseBoundedJson(Buffer.alloc(LIMITS.metadataBytes + 1, 32)),
    ).toThrow("exceeds");
  });
  it("bounded decompression rejects a compressed metadata bomb", () => {
    const metadata = Buffer.concat([
      Buffer.from("workflow\0"),
      Buffer.from([0]),
      deflateSync(Buffer.alloc(LIMITS.metadataBytes + 1, 32)),
    ]);
    expect(() => extractWorkflow(png(metadata, "zTXt"))).toThrow(
      "decompression limit",
    );
  });
  it("rejects bad PNG checksum and trailing bytes", () => {
    const valid = png(Buffer.from('workflow\0{"nodes":[]}'));
    const corrupt = Buffer.from(valid);
    corrupt[corrupt.length - 1] ^= 1;
    expect(() => extractWorkflow(corrupt)).toThrow("checksum");
    expect(() =>
      extractWorkflow(Buffer.concat([valid, Buffer.from("payload")])),
    ).toThrow("trailing data");
  });
  it("extracts graph metadata as inert JSON, ignoring filename traversal", () => {
    const source = {
      "1": {
        class_type: "ShellExecute",
        inputs: { command: "touch /tmp/never-execute-graph-input" },
      },
    };
    expect(
      extractWorkflow(
        Buffer.from(JSON.stringify(source)),
        "../../private/secret.json",
      ),
    ).toEqual(source);
    expect(
      extractWorkflow(
        png(Buffer.from("workflow\0" + JSON.stringify(source))),
        "image.png",
      ),
    ).toEqual(source);
  });
});
