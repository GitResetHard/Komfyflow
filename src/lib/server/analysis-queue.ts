import { randomUUID } from "node:crypto";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import { Prisma } from "@prisma/client";
import { db } from "./db";
import { readObject } from "./storage";
import {
  analyzeWorkflow,
  AnalysisError,
  createPreviewGraph,
  extractWorkflow,
} from "@/analysis";
let queue: Queue | undefined;
export async function enqueueAnalysis(versionId: string) {
  if (process.env.REDIS_URL) {
    queue ??= new Queue("workflow-analysis", {
      connection: new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
      }),
    });
    await queue.add(
      "analyze",
      { versionId },
      {
        jobId: `${versionId}-${randomUUID()}`,
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 1000,
      },
    );
    return;
  }
  if (process.env.NODE_ENV === "production")
    throw new Error("Production analysis requires REDIS_URL");
  await analyzeVersion(versionId);
}
export async function analyzeVersion(versionId: string) {
  const version = await db.workflowVersion.findUniqueOrThrow({
    where: { id: versionId },
  });
  const run = await db.analysisRun.create({
    data: { versionId, progress: 10, stage: "reading" },
  });
  try {
    const bytes = await readObject(version.sourceKey);
    await db.analysisRun.update({
      where: { id: run.id },
      data: { progress: 35, stage: "analyzing" },
    });
    const report = analyzeWorkflow(bytes, version.originalName);
    const preview = createPreviewGraph(
      extractWorkflow(bytes, version.originalName),
    ) as unknown as Prisma.InputJsonValue;
    if (report.originalSha256 !== version.sha256)
      throw new AnalysisError(
        "INTEGRITY_MISMATCH",
        "Stored original checksum does not match upload.",
      );
    const analysis = report as unknown as Prisma.InputJsonValue;
    await db.analysisRun.update({
      where: { id: run.id },
      data: { progress: 90, stage: "storing" },
    });
    await db.$transaction([
      db.workflowVersion.update({
        where: { id: versionId },
        data: {
          analysis,
          preview,
          status: "READY",
          nodes: report.nodes.length,
          links: report.links.length,
          error: null,
        },
      }),
      db.analysisRun.update({
        where: { id: run.id },
        data: {
          analysis,
          status: "READY",
          progress: 100,
          stage: "complete",
          finishedAt: new Date(),
        },
      }),
    ]);
  } catch (error) {
    const message =
      error instanceof AnalysisError
        ? `${error.code}: ${error.message}`
        : "Analysis could not be completed. Please retry.";
    await db.$transaction([
      db.workflowVersion.update({
        where: { id: versionId },
        data: { status: "FAILED", error: message },
      }),
      db.analysisRun.update({
        where: { id: run.id },
        data: {
          status: "FAILED",
          stage: "failed",
          error: message,
          finishedAt: new Date(),
        },
      }),
    ]);
  }
}
