import { db } from "@/lib/server/db";
import { handler, json, body } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { allowedWorkflow, serialize, metadata } from "@/lib/server/workflows";
import { HttpError } from "@/lib/server/security";
const idOf = (r: Request) => new URL(r.url).pathname.split("/").at(-1)!;
export const GET = handler(async (request) => {
  const { workflow, context } = await allowedWorkflow(idOf(request));
  let liked = false,
    bookmarked = false;
  if (context.id) {
    await db.viewHistory.upsert({
      where: {
        userId_workflowId: { userId: context.id, workflowId: workflow.id },
      },
      create: { userId: context.id, workflowId: workflow.id },
      update: { viewedAt: new Date() },
    });
    liked = !!(await db.like.findUnique({
      where: {
        userId_workflowId: { userId: context.id, workflowId: workflow.id },
      },
    }));
    bookmarked = !!(await db.bookmark.findUnique({
      where: {
        userId_workflowId: { userId: context.id, workflowId: workflow.id },
      },
    }));
  }
  const versions = workflow.versions.map(
    ({ sourceKey, ...version }) => version,
  );
  return json({
    workflow: { ...serialize(workflow), versions, liked, bookmarked },
  });
});
export const PATCH = handler(async (request) => {
  const user = await requireUser();
  const { workflow } = await allowedWorkflow(idOf(request));
  if (workflow.authorId !== user.id)
    throw new HttpError(403, "Only the owner can edit this workflow.");
  const input = metadata.partial().parse(await body(request));
  const { tags, ...data } = input;
  await db.$transaction(async (tx) => {
    await tx.workflow.update({ where: { id: workflow.id }, data });
    if (tags) {
      await tx.workflowTag.deleteMany({ where: { workflowId: workflow.id } });
      for (const name of new Set(tags)) {
        const tag = await tx.tag.upsert({
          where: { name },
          create: { name },
          update: {},
        });
        await tx.workflowTag.create({
          data: { workflowId: workflow.id, tagId: tag.id },
        });
      }
    }
  });
  return json({ ok: true });
});
