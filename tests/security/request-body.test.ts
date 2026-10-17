import { describe, expect, it } from "vitest";
import { body } from "../../src/lib/server/api";
function request(value: string, headers: Record<string, string> = {}) {
  return new Request("https://komfyflow.example/api/settings", {
    method: "POST",
    headers,
    body: value,
  });
}
describe("request body byte cap", () => {
  it("parses ordinary JSON", async () => {
    await expect(body(request('{"adultOptIn":false}'))).resolves.toEqual({
      adultOptIn: false,
    });
  });
  it("rejects oversized body with missing content length", async () => {
    await expect(
      body(request(JSON.stringify({ value: "a".repeat(65536) }))),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects oversized body with lying content length", async () => {
    await expect(
      body(
        request(JSON.stringify({ value: "a".repeat(65536) }), {
          "content-length": "1",
        }),
      ),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("counts bytes, not characters", async () => {
    await expect(
      body(request(JSON.stringify({ value: "😀".repeat(20000) }))),
    ).rejects.toMatchObject({ status: 413 });
  });
  it("rejects malformed JSON without exposing parser details", async () => {
    await expect(body(request("{"))).rejects.toMatchObject({
      status: 400,
      message: "Invalid JSON body.",
    });
  });
});
