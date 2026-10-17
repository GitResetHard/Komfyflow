import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
const root = path.resolve(process.env.STORAGE_DIR || ".data/uploads");
function validateKey(key: string) {
  if (!/^[a-zA-Z0-9/_-]+\.[a-z0-9]+$/.test(key) || key.includes(".."))
    throw new Error("Invalid object key");
}
function client() {
  return new S3Client({
    region: process.env.B2_REGION || "us-west-004",
    endpoint: process.env.B2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.B2_KEY_ID!,
      secretAccessKey: process.env.B2_APPLICATION_KEY!,
    },
  });
}
function useB2() {
  if (process.env.STORAGE_DRIVER === "b2") {
    if (
      !process.env.B2_BUCKET ||
      !process.env.B2_ENDPOINT ||
      !process.env.B2_KEY_ID ||
      !process.env.B2_APPLICATION_KEY
    )
      throw new Error("B2 storage configuration incomplete");
    return true;
  }
  if (
    process.env.NODE_ENV === "production" &&
    process.env.ALLOW_LOCAL_STORAGE !== "true"
  )
    throw new Error("Production requires private B2 storage");
  return false;
}
export async function writeObject(key: string, bytes: Uint8Array) {
  validateKey(key);
  if (useB2()) {
    await client().send(
      new PutObjectCommand({
        Bucket: process.env.B2_BUCKET,
        Key: key,
        Body: bytes,
        ContentType: "application/octet-stream",
        IfNoneMatch: "*",
      }),
    );
    return;
  }
  const file = path.join(root, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes, { flag: "wx", mode: 0o600 });
}
export async function readObject(key: string): Promise<Buffer> {
  validateKey(key);
  if (useB2()) {
    const result = await client().send(
      new GetObjectCommand({ Bucket: process.env.B2_BUCKET, Key: key }),
    );
    if (!result.Body) throw new Error("Object missing");
    return Buffer.from(await result.Body.transformToByteArray());
  }
  return readFile(path.join(root, key));
}
export async function deleteObject(key: string) {
  validateKey(key);
  if (useB2()) {
    await client().send(
      new DeleteObjectCommand({ Bucket: process.env.B2_BUCKET, Key: key }),
    );
    return;
  }
  await unlink(path.join(root, key)).catch(() => undefined);
}
