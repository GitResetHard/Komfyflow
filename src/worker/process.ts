import type { Job } from "bullmq";
import { db } from "@/lib/server/db";
import { readObject } from "@/lib/server/storage";
import {
  analyzeWorkflow,
  AnalysisError,
  createPreviewGraph,
  extractWorkflow,
} from "@/analysis";

export async function processAnalysis(
  job: Pick<Job<{ versionId: string }>, "data">,
): Promise<void> {
  const { versionId } = job.data;
  if (typeof versionId !== "string" || versionId.length > 256)
    throw new Error("Invalid analysis job.");
  const version = await db.workflowVersion.findUnique({
    where: { id: versionId },
  });
  if (!version || version.status === "READY") return;
  const run = await db.analysisRun.create({
    data: { versionId, status: "PENDING", progress: 0, stage: "queued" },
  });
  // Percentages identify completed/begun milestones, not elapsed-time estimates.
  try {
    await db.analysisRun.update({
      where: { id: run.id },
      data: { progress: 10, stage: "reading" },
    });
    const bytes = await readObject(version.sourceKey);
    await db.analysisRun.update({
      where: { id: run.id },
      data: { progress: 35, stage: "analyzing" },
    });
    const report = analyzeWorkflow(bytes, version.originalName);
    if (report.originalSha256 !== version.sha256)
      throw new AnalysisError(
        "INTEGRITY_MISMATCH",
        "Stored original checksum does not match upload.",
      );
    const analysis = JSON.parse(JSON.stringify(report));
    const preview = JSON.parse(
      JSON.stringify(
        createPreviewGraph(extractWorkflow(bytes, version.originalName)),
      ),
    );
    await db.analysisRun.update({
      where: { id: run.id },
      data: { progress: 90, stage: "storing" },
    });
    await db.$transaction([
      db.workflowVersion.update({
        where: { id: versionId },
        data: {
          status: "READY",
          analysis,
          preview,
          nodes: report.summary.nodeCount,
          links: report.summary.linkCount,
          error: null,
        },
      }),
      db.analysisRun.update({
        where: { id: run.id },
        data: {
          status: "READY",
          progress: 100,
          stage: "complete",
          analysis,
          finishedAt: new Date(),
          error: null,
        },
      }),
    ]);
  } catch (error) {
    // Do not leak storage credentials, raw parser content, or infrastructure errors.
    const message =
      error instanceof AnalysisError
        ? `${error.code}: ${error.message}`
        : "Analysis could not be completed. Please retry or contact the administrator.";
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
          finishedAt: new Date(),
          error: message,
        },
      }),
    ]);
    if (!(error instanceof AnalysisError)) throw error; // Retry transient failures with queue backoff.
  }
}
