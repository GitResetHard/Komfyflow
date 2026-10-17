import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://localhost:3000";
let checks = 0;
let home = "";
for (const path of [
  "/",
  "/upload",
  "/auth",
  "/account",
  "/collections",
  "/workflows/sample-cinematic-landscape",
  "/embed/sample-cinematic-landscape",
  "/viewer/index.html",
  "/viewer/LICENSE.txt",
  "/api/health",
]) {
  const response = await fetch(base + path);
  assert.equal(response.status, 200, path);
  checks++;
  const content = await response.text();
  if (path === "/") {
    home = content;
    assert.match(
      response.headers.get("content-security-policy") || "",
      /frame-ancestors 'self'/,
    );
    checks++;
  }
  if (path.startsWith("/embed/") || path.startsWith("/viewer/")) {
    assert.match(
      response.headers.get("content-security-policy") || "",
      /frame-ancestors \*/,
    );
    checks++;
  }
  if (path === "/viewer/index.html") {
    assert.match(content, /script-src 'sha256-/);
    assert.doesNotMatch(content, /unsafe-eval/);
    checks += 2;
  }
}
const css = home.match(/href="([^\"]+\.css[^\"]*)"/);
assert.ok(css, "Production page links compiled stylesheet");
checks++;
const response = await fetch(new URL(css[1].replaceAll("&amp;", "&"), base));
assert.equal(response.status, 200);
checks++;
const styles = await response.text();
assert.match(styles, /--accent/);
assert.match(styles, /\.workflow-grid/);
checks += 2;
console.log(
  `PASS ${checks} production HTTP/assets checks: pages, health, compiled CSS, native viewer assets and frame/CSP headers.`,
);
