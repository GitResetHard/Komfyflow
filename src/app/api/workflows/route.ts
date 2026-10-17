import { Prisma } from "@prisma/client";
import { db } from "@/lib/server/db";
import { viewer } from "@/lib/server/auth";
import { discoveryWhere } from "@/lib/server/access";
import { handler, json } from "@/lib/server/api";
import { cardInclude, serialize, uploadVersion } from "@/lib/server/workflows";
export const GET = handler(async (request) => {
  const context = await viewer();
  const p = new URL(request.url).searchParams;
  const q = (p.get("q") || "").slice(0, 200);
  const page = Math.floor(
    Math.max(1, Math.min(1000, Number(p.get("page")) || 1)),
  );
  const analysisMatches = q
    ? await db.$queryRaw<Array<{ workflowId: string }>>(
        Prisma.sql`SELECT DISTINCT v.workflowId FROM WorkflowVersion v JOIN Workflow w ON w.id=v.workflowId WHERE v.status='READY' AND w.visibility='PUBLIC' AND (${context.adultOptIn} = true OR w.adult=false) AND JSON_SEARCH(LOWER(v.analysis), 'one', ${"%" + q.toLowerCase().replace(/[\\%_]/g, "\\$&") + "%"}, NULL, '$.models[*].filename', '$.dependencies[*].packagename', '$.dependencies[*].nodetype') IS NOT NULL LIMIT 5000`,
      )
    : [];
  const workflows = await db.workflow.findMany({
    where: {
      ...discoveryWhere(context),
      ...(q
        ? {
            OR: [
              { id: { in: analysisMatches.map((row) => row.workflowId) } },
              { title: { contains: q } },
              { description: { contains: q } },
              { tags: { some: { tag: { name: { contains: q } } } } },
            ],
          }
        : {}),
      ...(p.get("category") ? { category: p.get("category")! } : {}),
      ...(p.get("tag")
        ? { tags: { some: { tag: { name: p.get("tag")! } } } }
        : {}),
    },
    include: cardInclude,
    orderBy:
      p.get("sort") === "popular"
        ? { likes: { _count: "desc" } }
        : { createdAt: "desc" },
    take: 24,
    skip: (page - 1) * 24,
  });
  return json({
    workflows: workflows.map(serialize),
    page,
    hasMore: workflows.length === 24,
  });
});
export const POST = handler(async (request) =>
  json({ workflow: await uploadVersion(request) }, 201),
);
