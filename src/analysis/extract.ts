import { inflateSync } from "node:zlib";
import { AnalysisError, LIMITS } from "./types";
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
function fail(code: string, message: string): never {
  throw new AnalysisError(code, message);
}
export function parseBoundedJson(bytes: Uint8Array): unknown {
  if (bytes.byteLength > LIMITS.metadataBytes)
    fail("METADATA_TOO_LARGE", "Workflow metadata exceeds the supported size.");
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    return fail("INVALID_JSON", "Workflow metadata is not valid UTF-8 JSON.");
  }
  const stack: Array<[unknown, number]> = [[value, 0]];
  let count = 0;
  while (stack.length) {
    const [item, depth] = stack.pop()!;
    if (++count > LIMITS.values || depth > LIMITS.depth)
      fail("STRUCTURE_LIMIT", "Workflow structure is too complex.");
    if (typeof item === "string" && item.length > LIMITS.stringLength)
      fail("STRUCTURE_LIMIT", "Workflow contains an oversized text value.");
    if (item && typeof item === "object") {
      for (const [key, child] of Object.entries(item)) {
        if (key.length > 4096)
          fail("STRUCTURE_LIMIT", "Workflow contains an oversized object key.");
        if (["__proto__", "prototype", "constructor"].includes(key))
          fail("UNSAFE_KEY", "Workflow contains a reserved object key.");
        stack.push([child, depth + 1]);
        if (stack.length > LIMITS.values)
          fail("STRUCTURE_LIMIT", "Workflow structure is too complex.");
      }
    }
  }
  return value;
}
function inflateBounded(data: Buffer, remaining: number): Buffer {
  if (remaining <= 0)
    fail("METADATA_TOO_LARGE", "PNG metadata exceeds the supported size.");
  try {
    return inflateSync(data, { maxOutputLength: remaining });
  } catch {
    return fail(
      "INVALID_COMPRESSED_METADATA",
      "PNG metadata is corrupt or exceeds the decompression limit.",
    );
  }
}
function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
export function extractWorkflow(
  input: Uint8Array,
  _filename = "workflow.json",
): unknown {
  if (!input.byteLength) fail("EMPTY_FILE", "The workflow file is empty.");
  if (input.byteLength > LIMITS.fileBytes)
    fail("FILE_TOO_LARGE", "The workflow file exceeds the supported size.");
  const data = Buffer.from(input);
  if (!data.subarray(0, 8).equals(signature)) return parseBoundedJson(data);
  let offset = 8,
    chunks = 0,
    metadataTotal = 0,
    sawEnd = false,
    sawHeader = false;
  const payloads = new Map<string, Buffer>();
  while (offset < data.length) {
    if (++chunks > LIMITS.pngChunks || offset + 12 > data.length)
      fail("INVALID_PNG", "PNG chunk structure is invalid.");
    const len = data.readUInt32BE(offset);
    const end = offset + 12 + len;
    if (end > data.length)
      fail("INVALID_PNG", "PNG contains a truncated chunk.");
    const type = data.toString("ascii", offset + 4, offset + 8);
    const body = data.subarray(offset + 8, offset + 8 + len);
    if (
      crc32(data.subarray(offset + 4, offset + 8 + len)) !==
      data.readUInt32BE(offset + 8 + len)
    )
      fail("INVALID_PNG_CRC", "PNG chunk checksum is invalid.");
    if (chunks === 1 && (type !== "IHDR" || len !== 13))
      fail("INVALID_PNG", "PNG header is missing or invalid.");
    if (type === "IHDR") {
      if (sawHeader) fail("INVALID_PNG", "PNG has duplicate headers.");
      sawHeader = true;
    }
    if (["tEXt", "zTXt", "iTXt"].includes(type)) {
      const zero = body.indexOf(0);
      if (zero < 1 || zero > 79)
        fail("INVALID_PNG_METADATA", "PNG text keyword is invalid.");
      const keyword = body.toString("latin1", 0, zero);
      if (keyword === "workflow" || keyword === "prompt") {
        if (payloads.has(keyword))
          fail(
            "AMBIGUOUS_METADATA",
            "PNG contains duplicate workflow metadata.",
          );
        let text: Buffer;
        if (type === "tEXt") text = body.subarray(zero + 1);
        else if (type === "zTXt") {
          if (body[zero + 1] !== 0)
            fail(
              "INVALID_PNG_METADATA",
              "PNG compression method is unsupported.",
            );
          text = inflateBounded(
            body.subarray(zero + 2),
            LIMITS.metadataBytes - metadataTotal,
          );
        } else {
          const flag = body[zero + 1],
            method = body[zero + 2];
          if (![0, 1].includes(flag) || method !== 0)
            fail(
              "INVALID_PNG_METADATA",
              "PNG international text encoding is invalid.",
            );
          const langEnd = body.indexOf(0, zero + 3);
          const translatedEnd = langEnd < 0 ? -1 : body.indexOf(0, langEnd + 1);
          if (translatedEnd < 0)
            fail(
              "INVALID_PNG_METADATA",
              "PNG international text is truncated.",
            );
          const content = body.subarray(translatedEnd + 1);
          text = flag
            ? inflateBounded(content, LIMITS.metadataBytes - metadataTotal)
            : content;
        }
        metadataTotal += text.length;
        if (metadataTotal > LIMITS.metadataBytes)
          fail(
            "METADATA_TOO_LARGE",
            "PNG metadata exceeds the supported size.",
          );
        payloads.set(keyword, text);
      }
    }
    offset = end;
    if (type === "IEND") {
      if (len || offset !== data.length)
        fail("INVALID_PNG", "PNG end marker or trailing data is invalid.");
      sawEnd = true;
      break;
    }
  }
  if (!sawEnd) fail("INVALID_PNG", "PNG end marker is missing.");
  const metadata = payloads.get("workflow") ?? payloads.get("prompt");
  if (!metadata)
    fail(
      "NO_WORKFLOW_METADATA",
      "PNG does not contain workflow or prompt metadata.",
    );
  return parseBoundedJson(metadata);
}
