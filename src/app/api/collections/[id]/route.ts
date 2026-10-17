import { z } from "zod";
import { db } from "@/lib/server/db";
import { viewer, requireUser } from "@/lib/server/auth";
import { accessibleWhere } from "@/lib/server/access";
import { handler, body, json } from "@/lib/server/api";
import { HttpError } from "@/lib/server/security";
import {
  allowedWorkflow,
  cardInclude,
  serialize,
} from "@/lib/server/workflows";
async function own(request: Request) {
  const user = await requireUser();
  const id = new URL(request.url).pathname.split("/").at(-1)!;
  const collection = await db.collection.findFirst({
    where: { id, userId: user.id },
  });
  if (!collection) throw new HttpError(404, "Collection not found.");
  return collection;
}
export const GET = handler(async (request) => {
  const collection = await own(request);
  const context = await viewer();
  const items = await db.collectionItem.findMany({
    where: { collectionId: collection.id, workflow: accessibleWhere(context) },
    include: { workflow: { include: cardInclude } },
  });
  return json({
    collection: {
      ...collection,
      items: items.map((i) => ({ ...i, workflow: serialize(i.workflow) })),
    },
  });
});
export const POST = handler(async (request) => {
  const collection = await own(request);
  const { workflowId } = z
    .object({ workflowId: z.string() })
    .parse(await body(request));
  await allowedWorkflow(workflowId);
  await db.collectionItem.upsert({
    where: {
      collectionId_workflowId: { collectionId: collection.id, workflowId },
    },
    create: { collectionId: collection.id, workflowId },
    update: {},
  });
  return json({ ok: true });
});
export const PATCH = handler(async (request) => {
  const collection = await own(request);
  const { name } = z
    .object({ name: z.string().trim().min(1).max(100) })
    .parse(await body(request));
  return json({
    collection: await db.collection.update({
      where: { id: collection.id },
      data: { name },
    }),
  });
});
export const DELETE = handler(async (request) => {
  const collection = await own(request);
  const workflowId = new URL(request.url).searchParams.get("workflowId");
  if (workflowId)
    await db.collectionItem.deleteMany({
      where: { collectionId: collection.id, workflowId },
    });
  else await db.collection.delete({ where: { id: collection.id } });
  return json({ ok: true });
});
