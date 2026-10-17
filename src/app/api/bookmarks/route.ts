import { db } from "@/lib/server/db";
import { viewer, requireUser } from "@/lib/server/auth";
import { accessibleWhere } from "@/lib/server/access";
import { handler, json } from "@/lib/server/api";
import { cardInclude, serialize } from "@/lib/server/workflows";
export const GET = handler(async () => {
  const user = await requireUser();
  const context = await viewer();
  const bookmarks = await db.bookmark.findMany({
    where: { userId: user.id, workflow: accessibleWhere(context) },
    include: { workflow: { include: cardInclude } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json({ workflows: bookmarks.map((b) => serialize(b.workflow)) });
});
