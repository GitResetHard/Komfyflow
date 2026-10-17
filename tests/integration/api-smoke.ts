/** Live acceptance suite. Run against a migrated, seeded disposable database/server. */
import assert from "node:assert/strict";
import { createServer } from "node:http";
import sharp from "sharp";
import { randomUUID } from "node:crypto";
import { db } from "../../src/lib/server/db";

const base = process.env.TEST_BASE_URL || "http://127.0.0.1:3000";
let checks = 0;
const mails: Array<{ to: string; template: string; link: string }> = [];
const mailServer = createServer(async (request, response) => {
  try {
    assert.equal(request.url, "/mail");
    assert.equal(
      request.headers.authorization,
      `Bearer ${process.env.MAIL_WEBHOOK_TOKEN || "integration-mail-secret"}`,
    );
    let bytes = "";
    for await (const chunk of request) bytes += chunk;
    const payload = JSON.parse(bytes);
    assert.deepEqual(Object.keys(payload).sort(), ["link", "template", "to"]);
    mails.push(payload);
    response.writeHead(200).end('{"ok":true}');
  } catch (error) {
    response.writeHead(400).end(String(error));
  }
});
function capturedToken(to: string, template: string) {
  const mail = mails.findLast((m) => m.to === to && m.template === template);
  assert.ok(mail, `Expected ${template} email webhook for ${to}`);
  assert.equal(new URL(mail.link).origin, new URL(base).origin);
  checks += 2;
  return new URL(mail.link).searchParams.get("token")!;
}

class Client {
  cookies = new Map<string, string>();
  async request(path: string, method = "GET", data?: unknown, origin = true) {
    const headers: Record<string, string> = {};
    if (origin && method !== "GET") headers.Origin = new URL(base).origin;
    if (this.cookies.size)
      headers.Cookie = [...this.cookies]
        .map(([k, v]) => `${k}=${v}`)
        .join("; ");
    let body: BodyInit | undefined;
    if (data instanceof FormData) body = data;
    else if (data !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(data);
    }
    const response = await fetch(`${base}${path}`, { method, headers, body });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0];
      const [key, ...value] = pair.split("=");
      this.cookies.set(key, value.join("="));
    }
    return response;
  }
  async json(path: string, method = "GET", data?: unknown, status = 200) {
    const response = await this.request(path, method, data);
    const value = await response.json();
    assert.equal(
      response.status,
      status,
      `${method} ${path}: ${JSON.stringify(value)}`,
    );
    checks++;
    return value;
  }
}
const owner = new Client(),
  other = new Client(),
  guest = new Client();
const suffix = randomUUID().replaceAll("-", "").slice(0, 10);
const password = "Correct-horse-battery-294!";
const username = `test_${suffix}`;
const email = `${username}@example.invalid`;
let ownerId = "";
const graph = JSON.stringify({
  last_node_id: 1,
  last_link_id: 0,
  nodes: [
    {
      id: 1,
      type: "EmptyLatentImage",
      pos: [0, 0],
      size: [200, 100],
      widgets_values: [512, 512, 1],
      widgets_values_named: { width: 512, height: 512, batch_size: 1 },
      inputs: [],
      outputs: [{ name: "LATENT", type: "LATENT", links: [] }],
    },
  ],
  links: [],
  groups: [],
  config: {},
  extra: {},
  version: 0.4,
});
async function upload(title: string, visibility: string, adult = false) {
  const form = new FormData();
  form.set(
    "file",
    new File([graph], "workflow.json", { type: "application/json" }),
  );
  form.set("title", `${suffix} ${title}`);
  form.set("visibility", visibility);
  form.set("adult", String(adult));
  form.set("category", "Integration test");
  form.set("tags", "testing,example");
  const result = await owner.json("/api/workflows", "POST", form, 201);
  for (let attempt = 0; attempt < 80; attempt++) {
    const version = await db.workflowVersion.findFirst({
      where: { workflowId: result.workflow.id },
    });
    if (version?.status === "READY") break;
    if (version?.status === "FAILED")
      throw new Error(version.error || "Analysis failed");
    if (attempt === 79) throw new Error("Upload analysis did not finish");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return result.workflow.id as string;
}
async function denied(client: Client, path: string, status = 404) {
  const response = await client.request(path);
  assert.equal(response.status, status, path);
  checks++;
}
async function main() {
  await new Promise<void>((resolve) =>
    mailServer.listen(
      Number(process.env.TEST_MAIL_PORT || 3101),
      "127.0.0.1",
      resolve,
    ),
  );
  try {
    const created = await owner.json(
      "/api/auth/register",
      "POST",
      { username, email, password },
      201,
    );
    ownerId = created.user.id;
    assert.equal(created.user.adultOptIn, false);
    assert.equal(created.user.passwordHash, undefined);
    checks += 2;
    await other.json(
      "/api/auth/register",
      "POST",
      {
        username: `other_${suffix}`,
        email: `other_${suffix}@example.invalid`,
        password,
      },
      201,
    );
    const blocked = await guest.request(
      "/api/auth/login",
      "POST",
      { identifier: username, password },
      false,
    );
    assert.equal(blocked.status, 403);
    checks++;
    await owner.json("/api/auth/me", "PATCH", {
      displayName: "Integration Author",
      bio: "Test biography",
    });
    const verifyToken = capturedToken(email, "verify");
    await guest.json("/api/auth/verify", "POST", { token: verifyToken });
    await guest.json("/api/auth/verify", "POST", { token: verifyToken }, 400);
    assert.equal((await owner.json("/api/auth/me")).user.verified, true);
    checks++;
    const publicId = await upload("Public", "PUBLIC");
    const privateId = await upload("Private", "PRIVATE");
    const unlistedId = await upload("Unlisted", "UNLISTED");
    const adultId = await upload("Adult", "PUBLIC", true);
    const badForm = new FormData();
    badForm.set("file", new File(["not valid JSON"], "invalid.json"));
    badForm.set("title", `${suffix} quarantined`);
    badForm.set("visibility", "PUBLIC");
    const bad = await owner.json("/api/workflows", "POST", badForm, 201);
    for (const action of [
      "",
      "/download",
      "/source",
      "/embed",
      "/versions",
      "/examples",
    ])
      await denied(guest, `/api/workflows/${bad.workflow.id}${action}`);
    await denied(owner, `/api/workflows/${bad.workflow.id}/download`, 409);
    const badOwner = await owner.json(`/api/workflows/${bad.workflow.id}`);
    assert.ok(
      ["PENDING", "FAILED"].includes(badOwner.workflow.versions[0].status),
    );
    checks++;
    const modelSearch = await guest.json(
      "/api/workflows?q=sd_xl_base_1.0.safetensors",
    );
    assert.ok(
      modelSearch.workflows.some(
        (w: { id: string }) => w.id === "sample-cinematic-landscape",
      ),
    );
    checks++;
    const browse = await guest.json(`/api/workflows?q=${suffix}`);
    assert.deepEqual(
      browse.workflows.map((w: { id: string }) => w.id),
      [publicId],
    );
    checks++;
    await guest.json(`/api/workflows/${publicId}`);
    await guest.json(`/api/workflows/${unlistedId}`);
    await denied(guest, `/api/workflows/${privateId}`);
    await denied(other, `/api/workflows/${privateId}`);
    await owner.json(`/api/workflows/${privateId}`);
    for (const action of [
      "",
      "/download",
      "/source",
      "/embed",
      "/versions",
      "/comments",
      "/examples",
      "/runs",
    ])
      await denied(guest, `/api/workflows/${adultId}${action}`);
    await denied(owner, `/api/workflows/${adultId}`);
    await owner.json("/api/preferences", "POST", { adultOptIn: true });
    await owner.json(`/api/workflows/${adultId}`);
    await guest.json("/api/preferences", "POST", { adultOptIn: true });
    await guest.json(`/api/workflows/${adultId}`);
    await guest.json("/api/preferences", "POST", { adultOptIn: false });
    await denied(guest, `/api/workflows/${adultId}`);
    await owner.json(`/api/workflows/${publicId}/like`, "POST", {});
    await owner.json(`/api/workflows/${adultId}/bookmark`, "POST", {});
    const comment = await other.json(
      `/api/workflows/${publicId}/comments`,
      "POST",
      { body: "Useful test workflow." },
      201,
    );
    assert.ok(comment.comment.id);
    checks++;
    const comments = await guest.json(`/api/workflows/${publicId}/comments`);
    assert.ok(
      comments.comments.some(
        (c: { id: string }) => c.id === comment.comment.id,
      ),
    );
    checks++;
    await other.json(
      `/api/workflows/${publicId}/comments?id=${comment.comment.id}`,
      "DELETE",
    );
    const collection = await owner.json(
      "/api/collections",
      "POST",
      { name: "Acceptance collection" },
      201,
    );
    await owner.json(`/api/collections/${collection.collection.id}`, "POST", {
      workflowId: adultId,
    });
    await denied(other, `/api/collections/${collection.collection.id}`);
    await owner.json("/api/preferences", "POST", { adultOptIn: false });
    const bookmarks = await owner.json("/api/bookmarks");
    assert.ok(
      !bookmarks.workflows.some((w: { id: string }) => w.id === adultId),
    );
    checks++;
    const history = await owner.json("/api/history");
    assert.ok(
      !history.history.some(
        (h: { workflowId: string }) => h.workflowId === adultId,
      ),
    );
    checks++;
    const filteredCollection = await owner.json(
      `/api/collections/${collection.collection.id}`,
    );
    assert.equal(filteredCollection.collection.items.length, 0);
    checks++;
    const profile = await guest.json(`/api/profiles/${username}`);
    assert.deepEqual(
      profile.workflows.map((w: { id: string }) => w.id),
      [publicId],
    );
    checks++;
    const download = await guest.request(`/api/workflows/${publicId}/download`);
    assert.equal(download.status, 200);
    assert.equal(await download.text(), graph);
    checks += 2;
    const preview = await guest.json(`/api/workflows/${publicId}/source`);
    assert.ok(preview.nodes);
    assert.deepEqual(preview.nodes[0].widgets_values, [512, 512, 1]);
    assert.deepEqual(preview.nodes[0].widgets_values_named, {
      width: 512,
      height: 512,
      batch_size: 1,
    });
    checks += 3;
    const cachedVersion = await db.workflowVersion.findFirstOrThrow({
      where: { workflowId: publicId },
    });
    await db.workflowVersion.update({
      where: { id: cachedVersion.id },
      data: {
        analysis: { analyzerVersion: "0.2.0" },
        preview: { nodes: [{ widgets_values: [null] }] },
      },
    });
    const upgradedPreview = await guest.json(
      `/api/workflows/${publicId}/source`,
    );
    assert.deepEqual(upgradedPreview.nodes[0].widgets_values, [512, 512, 1]);
    assert.deepEqual(upgradedPreview.nodes[0].widgets_values_named, {
      width: 512,
      height: 512,
      batch_size: 1,
    });
    checks += 2;
    await db.workflowVersion.update({
      where: { id: cachedVersion.id },
      data: {
        analysis: cachedVersion.analysis!,
        preview: cachedVersion.preview!,
      },
    });
    const form = new FormData();
    form.set("file", new File([graph], "workflow-v2.json"));
    await owner.json(`/api/workflows/${publicId}/versions`, "POST", form, 201);
    const detail = await owner.json(`/api/workflows/${publicId}`);
    assert.equal(detail.workflow.versions.length, 2);
    assert.equal(detail.workflow.versions[0].number, 2);
    assert.equal(detail.workflow.versions[0].sourceKey, undefined);
    checks += 3;
    for (let attempt = 0; attempt < 80; attempt++) {
      const result = await owner.json(`/api/workflows/${publicId}`);
      if (result.workflow.versions[0].status !== "PENDING") {
        assert.equal(result.workflow.versions[0].status, "READY");
        checks++;
        break;
      }
      if (attempt === 79) throw new Error("Analysis worker did not finish.");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    await owner.json(`/api/workflows/${publicId}/reanalyze`, "POST", {
      versionId: detail.workflow.versions[0].id,
    });
    for (let attempt = 0; attempt < 80; attempt++) {
      const runs = await owner.json(
        `/api/workflows/${publicId}/runs?version=${detail.workflow.versions[0].id}`,
      );
      if (
        runs.runs.filter((r: { status: string }) => r.status === "READY")
          .length >= 2
      ) {
        assert.ok(runs.runs.every((r: { analysis: unknown }) => r.analysis));
        assert.ok(
          runs.runs
            .filter((r: { status: string }) => r.status === "READY")
            .every(
              (r: { progress: number; stage: string }) =>
                r.progress === 100 && r.stage === "complete",
            ),
        );
        checks++;
        checks++;
        break;
      }
      if (attempt === 79) throw new Error("Reanalysis did not finish.");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const oldDownload = await guest.request(
      `/api/workflows/${publicId}/download?version=${detail.workflow.versions[1].id}`,
    );
    assert.equal(await oldDownload.text(), graph);
    checks++;
    const imageBytes = await sharp({
      create: { width: 32, height: 24, channels: 3, background: "#663399" },
    })
      .withMetadata({ exif: { IFD0: { Artist: "Private Artist" } } })
      .jpeg()
      .toBuffer();
    const imageForm = new FormData();
    imageForm.set(
      "file",
      new File([new Uint8Array(imageBytes)], "example.jpg", {
        type: "image/jpeg",
      }),
    );
    imageForm.set("caption", "Example integration image");
    imageForm.set("versionId", detail.workflow.versions[0].id);
    const imageResult = await owner.json(
      `/api/workflows/${publicId}/examples`,
      "POST",
      imageForm,
      201,
    );
    const examples = await guest.json(`/api/workflows/${publicId}/examples`);
    assert.equal(
      examples.examples[0].versionId,
      detail.workflow.versions[0].id,
    );
    checks++;
    const imageResponse = await guest.request(imageResult.example.url);
    assert.equal(imageResponse.headers.get("content-type"), "image/webp");
    const imageMeta = await sharp(
      Buffer.from(await imageResponse.arrayBuffer()),
    ).metadata();
    assert.equal(imageMeta.exif, undefined);
    assert.equal(imageMeta.icc, undefined);
    assert.equal(imageMeta.width, 32);
    checks += 4;
    const forbiddenDelete = await other.request(
      `/api/workflows/${publicId}/examples?id=${imageResult.example.id}`,
      "DELETE",
    );
    assert.equal(forbiddenDelete.status, 403);
    checks++;
    await owner.json(
      `/api/workflows/${publicId}/examples?id=${imageResult.example.id}`,
      "DELETE",
    );
    await denied(guest, imageResult.example.url);
    await owner.json(`/api/collections/${collection.collection.id}`, "DELETE");
    await owner.json("/api/history", "DELETE");
    await guest.json("/api/auth/recover", "POST", { email });
    const resetToken = capturedToken(email, "reset");
    await guest.json("/api/auth/reset", "POST", {
      token: resetToken,
      password: password + "new",
    });
    await guest.json(
      "/api/auth/reset",
      "POST",
      { token: resetToken, password: password + "new" },
      400,
    );
    assert.equal((await owner.json("/api/auth/me")).user, null);
    checks++;
    await owner.json("/api/auth/login", "POST", {
      identifier: email,
      password: password + "new",
    });
    await owner.json("/api/auth/logout", "POST", {});
    assert.equal((await owner.json("/api/auth/me")).user, null);
    checks++;
    console.info(
      `PASS: ${checks} live API acceptance checks across auth, origin/CSRF, discovery, visibility, adult filtering, versions, immutable downloads, analysis, profiles, comments, likes, collections, history, real local transactional-email delivery, verification, recovery, example image sanitation and deletion.`,
    );
  } finally {
    await db.user.deleteMany({
      where: { username: { in: [username, `other_${suffix}`] } },
    });
    await db.$disconnect();
    await new Promise<void>((resolve) => mailServer.close(() => resolve()));
  }
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
