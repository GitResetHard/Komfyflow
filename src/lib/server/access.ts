export type Viewer = { id?: string; adultOptIn: boolean };
export type Resource = { authorId: string; visibility: string; adult: boolean };
/** Adult filtering applies even to owners, direct links, files and embeds. */
export function canViewWorkflow(resource: Resource, viewer: Viewer): boolean {
  if (resource.adult && !viewer.adultOptIn) return false;
  return (
    resource.visibility === "PUBLIC" ||
    resource.visibility === "UNLISTED" ||
    (resource.visibility === "PRIVATE" &&
      !!viewer.id &&
      resource.authorId === viewer.id)
  );
}
export function canDiscoverWorkflow(
  resource: Resource,
  viewer: Viewer,
): boolean {
  return resource.visibility === "PUBLIC" && canViewWorkflow(resource, viewer);
}
export function discoveryWhere(viewer: Viewer) {
  return {
    visibility: "PUBLIC" as const,
    versions: { some: { status: "READY" as const } },
    ...(viewer.adultOptIn ? {} : { adult: false }),
  };
}
export function accessibleWhere(viewer: Viewer) {
  return {
    ...(viewer.adultOptIn ? {} : { adult: false }),
    OR: [
      {
        versions: { some: { status: "READY" as const } },
        visibility: { in: ["PUBLIC", "UNLISTED"] as ("PUBLIC" | "UNLISTED")[] },
      },
      ...(viewer.id ? [{ authorId: viewer.id }] : []),
    ],
  };
}
