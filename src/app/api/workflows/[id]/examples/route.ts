import sharp from "sharp";
import { db } from "@/lib/server/db";
import { handler, json } from "@/lib/server/api";
import { requireUser } from "@/lib/server/auth";
import { allowedWorkflow, boundedBytes } from "@/lib/server/workflows";
import { HttpError, randomToken, rateLimit } from "@/lib/server/security";
import { readObject, writeObject, deleteObject } from "@/lib/server/storage";
const idOf = (r: Request) => new URL(r.url).pathname.split("/").at(-2)!;
export const GET = handler(async (request) => {
  const id = idOf(request);
  await allowedWorkflow(id);
  const imageId = new URL(request.url).searchParams.get("image");
  if (imageId) {
    const image = await db.exampleImage.findFirst({
      where: { id: imageId, workflowId: id },
    });
    if (!image) throw new HttpError(404, "Image not found.");
    return new Response(new Uint8Array(await readObject(image.sourceKey)), {
      headers: {
        "Content-Type": image.contentType,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, no-store",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }
  const examples = await db.exampleImage.findMany({
    where: { workflowId: id },
    orderBy: { createdAt: "asc" },
  });
  return json({
    examples: examples.map(({ sourceKey, ...image }) => ({
      ...image,
      url: `/api/workflows/${id}/examples?image=${image.id}`,
    })),
  });
});
export const POST = handler(async (request) => {
  const user = await requireUser();
  const id = idOf(request);
  const { workflow } = await allowedWorkflow(id);
  if (workflow.authorId !== user.id)
    throw new HttpError(403, "Only the owner can add examples.");
  await rateLimit(`images:${user.id}`, 30, 3600_000);
  const bytes = await boundedBytes(request, 11 * 1024 * 1024);
  const form = await new Request(request.url, {
    method: "POST",
    headers: { "Content-Type": request.headers.get("content-type") || "" },
    body: bytes,
  }).formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 10 * 1024 * 1024)
    throw new HttpError(400, "Choose an image under 10 MB.");
  const content = Buffer.from(await file.arrayBuffer());
  let ext: string, type: string;
  if (
    content
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  ) {
    ext = "png";
    type = "image/png";
  } else if (content[0] === 255 && content[1] === 216 && content[2] === 255) {
    ext = "jpg";
    type = "image/jpeg";
  } else if (
    content.toString("ascii", 0, 4) === "RIFF" &&
    content.toString("ascii", 8, 12) === "WEBP"
  ) {
    ext = "webp";
    type = "image/webp";
  } else
    throw new HttpError(400, "Only PNG, JPEG and WebP images are supported.");
  let sanitized: Buffer;
  try {
    const decoder = sharp(content, {
      limitInputPixels: 40_000_000,
      animated: false,
    });
    const info = await decoder.metadata();
    if ((info.pages || 1) > 1) throw new Error("Animated image");
    sanitized = await decoder.rotate().webp({ quality: 90 }).toBuffer();
    ext = "webp";
    type = "image/webp";
  } catch {
    throw new HttpError(
      400,
      "The image is invalid, animated, or exceeds the pixel limit.",
    );
  }
  const versionId = String(form.get("versionId") || "") || null;
  if (
    versionId &&
    !workflow.versions.some((v) => v.id === versionId && v.status === "READY")
  )
    throw new HttpError(400, "Version does not belong to this workflow.");
  const sourceKey = `examples/${randomToken()}.${ext}`;
  await writeObject(sourceKey, sanitized);
  try {
    const image = await db.exampleImage.create({
      data: {
        workflowId: id,
        versionId,
        caption: String(form.get("caption") || "").slice(0, 500),
        sourceKey,
        contentType: type,
      },
    });
    return json(
      {
        example: {
          id: image.id,
          caption: image.caption,
          versionId,
          url: `/api/workflows/${id}/examples?image=${image.id}`,
        },
      },
      201,
    );
  } catch (error) {
    await deleteObject(sourceKey);
    throw error;
  }
});
export const DELETE = handler(async (request) => {
  const user = await requireUser();
  const id = idOf(request);
  const { workflow } = await allowedWorkflow(id);
  if (workflow.authorId !== user.id)
    throw new HttpError(403, "Only the owner can remove examples.");
  const image = await db.exampleImage.findFirst({
    where: {
      id: new URL(request.url).searchParams.get("id") || "",
      workflowId: id,
    },
  });
  if (!image) throw new HttpError(404, "Image not found.");
  await db.exampleImage.delete({ where: { id: image.id } });
  await deleteObject(image.sourceKey);
  return json({ ok: true });
});
