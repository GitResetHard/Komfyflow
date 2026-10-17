import { z } from "zod";
import { db } from "@/lib/server/db";
import { handler, json, body } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import {
  allowedWorkflow,
  serialize,
  uploadVersion,
} from "@/lib/server/workflows";
import { HttpError, rateLimit, clientIp } from "@/lib/server/security";
import { readObject } from "@/lib/server/storage";
import { enqueueAnalysis } from "@/lib/server/analysis-queue";
import { extractWorkflow, createPreviewGraph } from "@/analysis";
const route = (r: Request) => {
  const parts = new URL(r.url).pathname.split("/");
  return { id: parts.at(-2)!, action: parts.at(-1)! };
};
export const GET = handler(async (request) => {
  const { id, action } = route(request);
  const { workflow } = await allowedWorkflow(id);
  const params = new URL(request.url).searchParams;
  if (action === "comments")
    return json({
      comments: await db.comment.findMany({
        where: { workflowId: id },
        include: {
          user: {
            select: { username: true, displayName: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 200,
      }),
    });
  if (action === "versions")
    return json({
      versions: workflow.versions.map(({ sourceKey, ...v }) => v),
    });
  const version =
    workflow.versions.find((v) => v.id === params.get("version")) ||
    (!params.has("version") ? workflow.versions[0] : undefined);
  if (!version) throw new HttpError(404, "Version not found.");
  if (action === "runs")
    return json({
      runs: await db.analysisRun.findMany({
        where: { versionId: version.id },
        orderBy: { startedAt: "desc" },
        take: 20,
      }),
    });
  if (
    ["embed", "download", "source"].includes(action) &&
    version.status !== "READY"
  )
    throw new HttpError(
      409,
      "This version is quarantined until analysis succeeds.",
      "VERSION_NOT_READY",
    );
  if (action === "embed")
    return json({
      workflow: {
        id: workflow.id,
        title: workflow.title,
        author: workflow.author,
        version: {
          id: version.id,
          number: version.number,
          status: version.status,
          analysis: version.analysis,
        },
      },
    });
  if (action === "download") {
    const bytes = await readObject(version.sourceKey);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${version.originalName}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  }
  if (action === "source") {
    const report = version.analysis;
    if (
      version.preview &&
      report &&
      typeof report === "object" &&
      !Array.isArray(report) &&
      report.analyzerVersion === "0.3.0"
    )
      return json(version.preview);
    // Older cached previews intentionally redacted values. Reproject the same gated original
    // instead of silently losing current named/positional widget metadata.
    await rateLimit(`source:${clientIp(request)}`, 30, 60_000);
    const bytes = await readObject(version.sourceKey);
    return json(
      createPreviewGraph(extractWorkflow(bytes, version.originalName)),
    );
  }
  throw new HttpError(404, "Not found.");
});
export const POST = handler(async (request) => {
  const { id, action } = route(request);
  if (action === "versions")
    return json({ workflow: await uploadVersion(request, id) }, 201);
  const user = await requireUser();
  const { workflow } = await allowedWorkflow(id);
  if (action === "like" || action === "bookmark") {
    const key = { userId_workflowId: { userId: user.id, workflowId: id } };
    if (action === "like") {
      const exists = await db.like.findUnique({ where: key });
      if (exists) await db.like.delete({ where: key });
      else await db.like.create({ data: { userId: user.id, workflowId: id } });
      return json({ active: !exists });
    }
    const exists = await db.bookmark.findUnique({ where: key });
    if (exists) await db.bookmark.delete({ where: key });
    else
      await db.bookmark.create({ data: { userId: user.id, workflowId: id } });
    return json({ active: !exists });
  }
  if (action === "comments") {
    await rateLimit(`comment:${user.id}`, 15, 60_000);
    const input = z
      .object({ body: z.string().trim().min(1).max(3000) })
      .parse(await body(request));
    return json(
      {
        comment: await db.comment.create({
          data: { ...input, userId: user.id, workflowId: id },
          include: {
            user: {
              select: { username: true, displayName: true, avatarUrl: true },
            },
          },
        }),
      },
      201,
    );
  }
  if (action === "reanalyze") {
    if (workflow.authorId !== user.id)
      throw new HttpError(403, "Only the owner can request analysis.");
    await rateLimit(`analysis:${user.id}`, 10, 3600_000);
    const input = z
      .object({ versionId: z.string().optional() })
      .parse(await body(request));
    const version =
      workflow.versions.find((v) => v.id === input.versionId) ||
      (!input.versionId ? workflow.versions[0] : undefined);
    if (!version) throw new HttpError(404, "Version not found.");
    const claimed = await db.workflowVersion.updateMany({
      where: { id: version.id, status: { not: "PENDING" } },
      data: { status: "PENDING", error: null },
    });
    if (!claimed.count) throw new HttpError(409, "Analysis is already queued.");
    try {
      await enqueueAnalysis(version.id);
    } catch (error) {
      await db.workflowVersion.update({
        where: { id: version.id },
        data: {
          status: "FAILED",
          error: "Analysis queue unavailable. Please retry.",
        },
      });
      throw error;
    }
    return json({ ok: true });
  }
  throw new HttpError(404, "Not found.");
});
export const DELETE = handler(async (request) => {
  const { id, action } = route(request);
  const user = await requireUser();
  await allowedWorkflow(id);
  if (action !== "comments") throw new HttpError(404, "Not found.");
  const commentId = new URL(request.url).searchParams.get("id") || "";
  const comment = await db.comment.findFirst({
    where: { id: commentId, workflowId: id, userId: user.id },
  });
  if (!comment) throw new HttpError(404, "Comment not found.");
  await db.comment.delete({ where: { id: comment.id } });
  return json({ ok: true });
});
