import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { assertOrigin, HttpError } from "./security";
export function handler(fn: (request: Request) => Promise<Response>) {
  return async (request: Request) => {
    try {
      assertOrigin(request);
      return await fn(request);
    } catch (error) {
      if (error instanceof HttpError)
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        );
      if (error instanceof ZodError)
        return NextResponse.json(
          {
            error: "Please check the submitted fields.",
            code: "VALIDATION_ERROR",
            fields: error.flatten(),
          },
          { status: 400 },
        );
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      )
        return NextResponse.json(
          { error: "That value is already in use.", code: "CONFLICT" },
          { status: 409 },
        );
      console.error(
        "API request failed",
        error instanceof Error ? error.message : error,
      );
      return NextResponse.json(
        {
          error: "Something went wrong. Please try again.",
          code: "INTERNAL_ERROR",
        },
        { status: 500 },
      );
    }
  };
}
export const json = (body: unknown, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
export async function body(request: Request) {
  const limit = 65536;
  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > limit) throw new HttpError(413, "Request is too large.");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Invalid JSON body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)),
    );
  } catch {
    throw new HttpError(400, "Invalid JSON body.");
  }
}
