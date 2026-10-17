import { randomUUID } from "node:crypto";
import { test, expect, expectRenderedGraph } from "./fixtures";

const sampleTitle = "Cinematic landscapes with SDXL";
const samplePath = "/workflows/sample-cinematic-landscape";
const samples = [
  sampleTitle,
  "Soft-light portrait studio",
  "Architectural concept explorer",
  "Abstract material experiments",
  "Product still life essentials",
  "Motion storyboard starter",
];

test("discovery renders real seeded workflows and usable navigation", async ({
  page,
  isMobile,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "A good workflow",
  );
  await expect(page.locator("article.workflow-card")).toHaveCount(6);
  for (const title of samples)
    await expect(
      page.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  await expect(
    page.getByText("6 workflows to explore", { exact: true }),
  ).toBeVisible();
  if (isMobile) {
    await page.getByRole("button", { name: "Toggle navigation" }).click();
    await expect(page.locator("aside.sidebar")).toHaveClass(/open/);
    await page
      .getByRole("link", { name: "My collections", exact: true })
      .click();
    await expect(page).toHaveURL(/\/collections$/);
    await expect(page.locator("aside.sidebar")).not.toHaveClass(/open/);
  } else {
    await page.getByRole("link", { name: sampleTitle, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${samplePath}$`));
    await expect(
      page.getByRole("heading", { level: 1, name: sampleTitle }),
    ).toBeVisible();
  }
});

test("search, category, model search, and empty state use the live API", async ({
  page,
}) => {
  await page.goto("/");
  const search = page.getByRole("textbox", { name: "Search workflows" });
  await expect(page.locator("article.workflow-card")).toHaveCount(6);
  await search.fill("portrait");
  await expect(page.locator("article.workflow-card")).toHaveCount(1);
  await expect(
    page.getByRole("heading", {
      name: "Soft-light portrait studio",
      exact: true,
    }),
  ).toBeVisible();
  await search.fill("no_workflow_can_match_this_918c");
  await expect(
    page.getByRole("heading", { name: "A little room for discovery" }),
  ).toBeVisible();
  await expect(page.locator("article.workflow-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(page.locator("article.workflow-card")).toHaveCount(6);
  await page
    .getByRole("button", { name: "Video & motion", exact: true })
    .click();
  await expect(
    page.getByText("No workflows match those filters. Try a broader search.", {
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "All workflows", exact: true })
    .click();
  await search.fill("sd_xl_base_1.0.safetensors");
  await expect(page.locator("article.workflow-card")).toHaveCount(6);
  await page
    .getByRole("combobox", { name: "Sort workflows" })
    .selectOption("newest");
  await expect(page.locator("article.workflow-card")).toHaveCount(6);
});

test("light theme and accent persist across a real reload", async ({
  page,
  isMobile,
}, testInfo) => {
  await page.goto("/");
  await expect(page.locator("article.workflow-card")).toHaveCount(6);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await testInfo.attach("discovery-dark", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  if (isMobile)
    await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("button", { name: "teal accent" }).click();
  if (isMobile)
    await page.getByRole("button", { name: "Close navigation" }).click();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("data-accent", "teal");
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
  await expect(page.locator("article.workflow-card")).toHaveCount(6);
  await testInfo.attach("discovery-light-teal", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});

test("registration, logout, rejected login, and successful login work end to end", async ({
  page,
}) => {
  const username = `browser_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const password = "Synthetic-browser-password-419!";
  await page.goto("/auth?mode=register");
  await expect(
    page.getByRole("heading", { name: "Make yourself at home." }),
  ).toBeVisible();
  await page.getByLabel("Username", { exact: true }).fill(username);
  await page
    .getByLabel("Email address", { exact: true })
    .fill(`${username}@example.invalid`);
  await page.getByLabel("Password", { exact: true }).fill(password);
  const registration = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/auth/register") &&
      response.request().method() === "POST",
  );
  await page
    .locator("form")
    .getByRole("button", { name: "Create account" })
    .click();
  const registered = await registration;
  expect(registered.status()).toBe(201);
  expect((await registered.json()).emailSent).toBe(true);
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("heading", {
      name: `Good to see you, ${username}.`,
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make it your own." }),
  ).toBeVisible();
  await page.goto("/auth");
  await expect(
    page.getByRole("heading", { name: "Welcome back, maker." }),
  ).toBeVisible();
  await page.getByLabel("Email or username").fill(username);
  await page
    .getByLabel("Password", { exact: true })
    .fill("Deliberately-wrong-password");
  await page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Email, username or password is incorrect.",
  );
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page
    .locator("form")
    .getByRole("button", { name: "Sign in", exact: true })
    .click();
  await expect(page).toHaveURL(/\/account$/);
  await expect(
    page.getByRole("heading", {
      name: `Good to see you, ${username}.`,
      exact: true,
    }),
  ).toBeVisible();
});

test("workflow detail paints the native sandboxed canvas and exposes analysis", async ({
  page,
}, testInfo) => {
  await page.goto(samplePath);
  await expect(
    page.getByRole("heading", { name: sampleTitle, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Download original" }),
  ).toHaveAttribute("href", /\/download\?version=.+/);
  await expect(
    page.getByText("Read only · No code is executed", { exact: true }),
  ).toBeVisible();
  const iframe = page.locator(
    'iframe[title="Read-only native ComfyUI workflow graph"]',
  );
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await expect(iframe).toHaveAttribute("referrerpolicy", "no-referrer");
  const native = iframe.contentFrame();
  await expect(native.locator("#status")).toHaveText(
    "Native ComfyUI renderer · read only",
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        window.__komfyflowViewerEvents
          ?.filter((event) => event.type === "loaded")
          .at(-1),
      ),
    )
    .toMatchObject({ format: "native", nodeCount: 7, origin: "null" });
  await expectRenderedGraph(native.locator("#graph"));
  await expect(
    native.locator("input, textarea, button, [contenteditable=true]"),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click();
  await page.getByRole("button", { name: "Fit", exact: true }).click();
  await expectRenderedGraph(native.locator("#graph"));
  await testInfo.attach("native-canvas-real-chromium", {
    body: await native.locator("#graph").screenshot(),
    contentType: "image/png",
  });
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Models & nodes", exact: true })
    .click();
  await expect(
    page
      .locator(".model-item")
      .filter({ hasText: "sd_xl_base_1.0.safetensors" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Versions", exact: true }).click();
  await expect(page.locator(".tab-content")).toContainText("Version 1");
});

test("public embed loads in a different-origin host with its real nested native iframe", async ({
  page,
  baseURL,
}, testInfo) => {
  // Only the embedding host is synthetic. Both iframe documents, source fetches,
  // CSP headers, graph renderer, and graph data come from the production server.
  const hostURL = new URL("/__acceptance_embed_host", baseURL);
  hostURL.hostname =
    hostURL.hostname === "localhost" ? "127.0.0.1" : "localhost";
  await page.route(hostURL.href, (route) =>
    route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><title>Embedding consumer</title></head><body style="margin:0"><iframe title="Public workflow embed" src="${baseURL}/embed/sample-cinematic-landscape" style="width:100%;height:760px;border:0"></iframe></body></html>`,
    }),
  );
  await page.goto(hostURL.href);
  const embed = page.frameLocator('iframe[title="Public workflow embed"]');
  await expect(
    embed.getByText("komfyflow · Read-only workflow", { exact: true }),
  ).toBeVisible();
  await expect(
    embed.getByRole("link", { name: "Open full workflow" }),
  ).toHaveAttribute("href", samplePath);
  const native = embed.frameLocator(
    'iframe[title="Read-only native ComfyUI workflow graph"]',
  );
  await expect(native.locator("#status")).toHaveText(
    "Native ComfyUI renderer · read only",
  );
  await expectRenderedGraph(native.locator("#graph"));
  await expect(embed.getByRole("alert")).toHaveCount(0);
  await testInfo.attach("cross-origin-embed", {
    body: await page.screenshot({ fullPage: true }),
    contentType: "image/png",
  });
});
