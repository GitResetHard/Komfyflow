import { db } from "@/lib/server/db";
import { viewer, requireUser } from "@/lib/server/auth";
import { accessibleWhere } from "@/lib/server/access";
import { handler, json } from "@/lib/server/api";
import { cardInclude, serialize } from "@/lib/server/workflows";
export const GET = handler(async () => {
  const user = await requireUser();
  const context = await viewer();
  const history = await db.viewHistory.findMany({
    where: { userId: user.id, workflow: accessibleWhere(context) },
    include: { workflow: { include: cardInclude } },
    orderBy: { viewedAt: "desc" },
    take: 100,
  });
  return json({
    history: history.map((h) => ({ ...h, workflow: serialize(h.workflow) })),
  });
});
export const DELETE = handler(async () => {
  const user = await requireUser();
  await db.viewHistory.deleteMany({ where: { userId: user.id } });
  return json({ ok: true });
});
