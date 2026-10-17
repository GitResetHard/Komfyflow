# Komfyflow

A self-hosted ComfyUI workflow library: original uploads, dependency analysis, a native graph viewer, and community tools. Original graphite/copper design with warm light mode and selectable accents.

## Status

Full requested feature scope is implemented, with automated and live local-service verification. Current native viewer integration and original connection rendering are included; real-browser CI results and remaining external-service gates are tracked separately. See [the acceptance ledger](docs/acceptance.md) and [security review](docs/security-review.md) for implementation and verification separately. Exact results are in [verification](docs/verification.md). Do not infer production readiness from a successful build. No workflows or custom-node code are executed.

## Stack

- Next.js 16.4.2 App Router, strict TypeScript, React 19.3.1, Tailwind CSS 4 and shadcn-compatible components
- MariaDB through Prisma 7.10.1 with its MariaDB driver adapter
- Separate TypeScript/BullMQ analysis worker and Redis
- Private Backblaze B2 S3-compatible storage, with an explicit local-development adapter
- Current native ComfyUI LiteGraph nodes/canvas in an isolated read-only viewer, with original connection rendering and semantic state adapters, pinned provenance and third-party notices

## Local setup

Requires Node.js 24, MariaDB and Redis, or Docker Compose.

1. Copy `.env.example` to `.env`, set unique database passwords and a random session secret (`openssl rand -hex 32`). Never commit `.env`.
2. For Docker, run `docker compose up --build`. Web binds only to `127.0.0.1:3000`. MariaDB and Redis are not exposed to the host. The one-shot migration service runs before web and worker.
3. For native development, set DATABASE_URL and REDIS_URL to your services, STORAGE_DRIVER=local, and STORAGE_DIR to a writable local path. Run `npm ci`, `npm run db:generate`, `npx prisma migrate deploy`, optionally `npm run db:seed` for six clearly labelled illustrative workflows, then `npm run dev` and `npm run worker` in separate terminals.
4. Open http://localhost:3000. Register an account. Configure transactional mail before testing verification and recovery delivery. The adapter receives POST JSON `{to, template: "verify" | "reset", link}` with a bearer token. Production should set REQUIRE_VERIFIED_UPLOADS=true.

`npm run dev`, `npm run worker`, and `npm run db:seed` generate Prisma Client before starting, so a missing or outdated generated client is rebuilt automatically. To repair an existing checkout reporting `Cannot find module '.prisma/client/default'`, run `npm run db:generate` and then restart the command. Client generation does not connect to or modify the database.

The local storage setting in `.env.example` is for a private development instance, not a public production configuration. Production requires HTTPS, a private B2 bucket and scoped application key, transactional mail, backups, abuse handling and operational monitoring. Never put B2 secrets into NEXT_PUBLIC variables.

## Verification

```sh
npm run db:generate
npm run typecheck
npm test
npm run build
npm audit --omit=dev
```

Live B2 and email delivery checks require operator-supplied credentials and are distinct from unit or local integration results. Docker requires a Docker daemon; a locally tested Node build is not equivalent to a verified Docker deployment.

## Storage and safety

Uploads are bounded, hashed and stored under generated immutable keys, never under a supplied filename. Derived analysis/preview data is separate from originals. Reports redact nonessential values; the gated native preview preserves bounded positional and named widget values as inert text. Prompts may therefore be visible to anyone permitted to view that workflow, just as in its original download. Server-side checks protect original download, gallery, graph, search, collection and history surfaces. Public, private and unlisted are distinct: unlisted is link-accessible but not discoverable; private is owner-only. Adult content is hidden by default for signed-in users and guests, including direct links, until explicit opt-in.

The analyzer statically examines JSON and PNG metadata. It does not load models, import Python packages, execute graphs or install extensions. Package claims carry confidence and provenance. Unknown models do not receive guessed download URLs. ComfyUI compatibility and viewer limitations are documented with the pinned viewer source.

## Production deployment

Use a TLS reverse proxy in front of the loopback web port. Set APP_URL to the exact HTTPS origin; the API verifies mutation origins. Enable TRUST_PROXY only when the proxy overwrites client forwarding headers. Use STORAGE_DRIVER=b2, remove ALLOW_LOCAL_STORAGE, configure all B2 fields and mail settings, and validate with `node --env-file=.env scripts/check-env.mjs` with NODE_ENV=production. Protect Redis and MariaDB on private networks; add backups and restore drills. Configure a B2 lifecycle policy deliberately: immutable application keys are not a substitute for backup or retention policy.

## Dependencies and licenses

The lockfile pins installations. Transitive PostCSS and deepmerge-ts overrides address advisories present in upstream dependency ranges; revalidate their compatibility when upgrading Next.js or Prisma. Third-party viewer source retains its original license notices. No claim is made that the whole ComfyUI frontend is MIT-licensed.

## End-to-end acceptance scripts

Against a disposable running instance: `TEST_BASE_URL=http://localhost:3000 npm run test:api` and `npm run test:redis`. Match APP_URL exactly. The API script starts a local mail capture on port3101; configure the app with MAIL_WEBHOOK_URL=http://127.0.0.1:3101/mail and MAIL_WEBHOOK_TOKEN=integration-mail-secret for this test only. These scripts create and clean up synthetic accounts/content, not user data. See docs/API.md.

The optional `scripts/local-integration-harness.sh` is specific to this build sandbox and deliberately resets its disposable database. It is not a production bootstrap command. Use Docker Compose or your configured services for normal setup.
