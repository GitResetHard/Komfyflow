import { db } from "@/lib/server/db";
import { viewer } from "@/lib/server/auth";
import { discoveryWhere } from "@/lib/server/access";
import { handler, json } from "@/lib/server/api";
import { cardInclude, serialize } from "@/lib/server/workflows";
import { HttpError } from "@/lib/server/security";
export const GET = handler(async (request) => {
  const username = new URL(request.url).pathname.split("/").at(-1)!;
  const context = await viewer();
  const profile = await db.user.findUnique({
    where: { username },
    select: {
      id: true,
      username: true,
      displayName: true,
      bio: true,
      avatarUrl: true,
      createdAt: true,
    },
  });
  if (!profile) throw new HttpError(404, "Profile not found.");
  const workflows = await db.workflow.findMany({
    where: {
      authorId: profile.id,
      ...(context.id === profile.id
        ? { ...(context.adultOptIn ? {} : { adult: false }) }
        : discoveryWhere(context)),
    },
    include: cardInclude,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return json({ profile, workflows: workflows.map(serialize) });
});
