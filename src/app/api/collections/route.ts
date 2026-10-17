import { z } from "zod";
import { db } from "@/lib/server/db";
import { accessibleWhere } from "@/lib/server/access";
import { viewer, requireUser } from "@/lib/server/auth";
import { handler, body, json } from "@/lib/server/api";
export const GET = handler(async () => {
  const user = await requireUser();
  const context = await viewer();
  return json({
    collections: await db.collection.findMany({
      where: { userId: user.id },
      include: {
        _count: {
          select: { items: { where: { workflow: accessibleWhere(context) } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  });
});
export const POST = handler(async (request) => {
  const user = await requireUser();
  const { name } = z
    .object({ name: z.string().trim().min(1).max(100) })
    .parse(await body(request));
  return json(
    {
      collection: await db.collection.create({
        data: { name, userId: user.id },
      }),
    },
    201,
  );
});
