/** Ephemeral local test transport. Never forwards mail or writes tokens to logs. */
import { createServer } from "node:http";

const port = Number(process.env.TEST_MAIL_PORT || 3101);
const expectedOrigin = new URL(
  process.env.TEST_BASE_URL || "http://localhost:3000",
).origin;
const server = createServer(async (request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200).end("ready");
    return;
  }
  if (request.method !== "POST" || request.url !== "/mail") {
    response.writeHead(404).end();
    return;
  }
  if (
    request.headers.authorization !==
    `Bearer ${process.env.MAIL_WEBHOOK_TOKEN || "integration-mail-secret"}`
  ) {
    response.writeHead(401).end();
    return;
  }
  try {
    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 16_384) throw new Error("Oversized test mail");
    }
    const mail = JSON.parse(body);
    if (
      !String(mail.to).endsWith("@example.invalid") ||
      !["verify", "reset"].includes(mail.template) ||
      new URL(mail.link).origin !== expectedOrigin
    ) {
      throw new Error("Only synthetic local acceptance mail is permitted");
    }
    response
      .writeHead(200, { "Content-Type": "application/json" })
      .end('{"ok":true}');
  } catch {
    response.writeHead(400).end();
  }
});
server.listen(port, "127.0.0.1");
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
