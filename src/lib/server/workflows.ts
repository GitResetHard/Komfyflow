import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "./db";
import { viewer, requireUser } from "./auth";
import { canViewWorkflow } from "./access";
import { HttpError, hashToken, randomToken, rateLimit } from "./security";
import { writeObject, deleteObject } from "./storage";
import { enqueueAnalysis } from "./analysis-queue";
export const cardInclude = {
  author: { select: { username: true, displayName: true, avatarUrl: true } },
  tags: { include: { tag: true } },
  versions: {
    where: { status: "READY" },
    orderBy: { number: "desc" as const },
    take: 1,
    select: {
      id: true,
      number: true,
      status: true,
      nodes: true,
      links: true,
      createdAt: true,
    },
  },
  _count: { select: { likes: true, comments: true } },
} satisfies Prisma.WorkflowInclude;
export function serialize<T extends { tags: { tag: { name: string } }[] }>(
  workflow: T,
) {
  return { ...workflow, tags: workflow.tags.map((t) => t.tag.name) };
}
export async function allowedWorkflow(id: string) {
  const context = await viewer();
  const workflow = await db.workflow.findUnique({
    where: { id },
    include: { ...cardInclude, versions: { orderBy: { number: "desc" } } },
  });
  if (!workflow || !canViewWorkflow(workflow, context))
    throw new HttpError(404, "Workflow not found.", "NOT_FOUND");
  if (workflow.authorId !== context.id) {
    workflow.versions = workflow.versions.filter((v) => v.status === "READY");
    if (!workflow.versions.length)
      throw new HttpError(404, "Workflow not found.", "NOT_FOUND");
  }
  return { workflow, context };
}
export const metadata = z.object({
  title: z.string().trim().min(1).max(180),
  description: z.string().max(10000).default(""),
  category: z.string().trim().min(1).max(80).default("General"),
  visibility: z.enum(["PUBLIC", "PRIVATE", "UNLISTED"]).default("PRIVATE"),
  adult: z.boolean().default(false),
  tags: z
    .array(
      z
        .string()
        .trim()
        .toLowerCase()
        .min(1)
        .max(60)
        .regex(/^[\p{L}\p{N} _-]+$/u),
    )
    .max(12)
    .default([]),
});
export async function boundedBytes(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body.");
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new HttpError(413, "Upload exceeds the size limit.", "TOO_LARGE");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function uploadVersion(request: Request, existingId?: string) {
  const user = await requireUser();
  await rateLimit(`upload:${user.id}`, 20, 3600_000);
  if (!user.verified && process.env.REQUIRE_VERIFIED_UPLOADS === "true")
    throw new HttpError(403, "Verify your email before uploading.");
  if (existingId) {
    const existing = await db.workflow.findUnique({
      where: { id: existingId },
    });
    if (!existing || existing.authorId !== user.id)
      throw new HttpError(404, "Workflow not found.");
  }
  const bytes = await boundedBytes(request, 21 * 1024 * 1024);
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": request.headers.get("content-type") || "" },
    body: bytes,
  }).formData();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 20 * 1024 * 1024
  )
    throw new HttpError(400, "Choose a JSON or PNG workflow under 20 MB.");
  const ext = file.name.toLowerCase().endsWith(".png")
    ? "png"
    : file.name.toLowerCase().endsWith(".json")
      ? "json"
      : null;
  if (!ext)
    throw new HttpError(400, "Only JSON and PNG workflows are supported.");
  const contents = Buffer.from(await file.arrayBuffer());
  const sourceKey = `workflows/${randomToken()}.${ext}`;
  await writeObject(sourceKey, contents);
  let created;
  try {
    created = await db.$transaction(async (tx) => {
      let workflowId = existingId;
      if (!workflowId) {
        const input = metadata.parse({
          title: form.get("title"),
          description: form.get("description") || "",
          category: form.get("category") || "General",
          visibility: form.get("visibility") || "PRIVATE",
          adult: form.get("adult") === "true",
          tags: String(form.get("tags") || "")
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean),
        });
        const { tags, ...data } = input;
        const workflow = await tx.workflow.create({
          data: {
            ...data,
            authorId: user.id,
            tags: {
              create: [...new Set(tags)].map((name) => ({
                tag: { connectOrCreate: { where: { name }, create: { name } } },
              })),
            },
          },
        });
        workflowId = workflow.id;
      }
      const latest = await tx.workflowVersion.aggregate({
        where: { workflowId },
        _max: { number: true },
      });
      const version = await tx.workflowVersion.create({
        data: {
          workflowId,
          number: (latest._max.number || 0) + 1,
          sourceKey,
          originalName: file.name
            .replace(/[^a-zA-Z0-9_.-]/g, "_")
            .slice(0, 200),
          sha256: createHash("sha256").update(contents).digest("hex"),
          bytes: contents.length,
        },
      });
      return { workflowId, versionId: version.id };
    });
  } catch (error) {
    await deleteObject(sourceKey);
    throw error;
  }
  try {
    await enqueueAnalysis(created.versionId);
  } catch {
    await db.workflowVersion.update({
      where: { id: created.versionId },
      data: {
        status: "FAILED",
        error: "Analysis queue unavailable. Please retry analysis.",
      },
    });
  }
  return serialize(
    await db.workflow.findUniqueOrThrow({
      where: { id: created.workflowId },
      include: cardInclude,
    }),
  );
}
