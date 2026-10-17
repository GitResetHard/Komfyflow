# Real-browser acceptance

Run against a migrated, freshly seeded **disposable local database**, Redis, the
production Next.js server, and the analysis worker. The suite creates synthetic
accounts, so the configuration rejects non-loopback `TEST_BASE_URL` values.
It does not use saved real accounts, external mail, B2 credentials, or screenshots
fabricated from HTML or a drawing library.

The complete reproducible sequence is in `.github/workflows/ci.yml`:

1. `npm ci` and `npx playwright install --with-deps chromium`
2. `npm run viewer:build` and `npm run check`
3. `npx prisma migrate deploy` and `npm run db:seed`
4. Start `npm run start` and `npm run worker` with the CI environment values.
5. `npm run test:redis`, `npm run test:runtime`, and `npm run test:api`
6. `npx playwright test`

The API suite owns the local mail listener during its execution. Playwright then
starts `tests/browser/mail-sink.mjs` on the same port after that suite has exited.
Configure `MAIL_WEBHOOK_URL=http://127.0.0.1:3101/mail`, the same
`MAIL_WEBHOOK_TOKEN` in both processes, and matching `APP_URL`/`TEST_BASE_URL`.
The mail sink accepts only synthetic `@example.invalid` recipients and local
verification/recovery links; it never sends mail or logs authentication tokens.

Desktop and mobile Chromium projects exercise seeded discovery, search and empty
states, category/model filters, navigation, persisted theme/accent selection,
registration, invalid and successful login, logout, workflow analysis, and a public
embed running in a different-origin host. Native-viewer tests require the actual
sandboxed iframe, successful renderer protocol message, seven seeded nodes, and
nontrivial painted canvas pixels. Simply creating a canvas or serving HTML does
not count as passing. Uncaught browser exceptions and HTTP 5xx responses fail the
suite. No retries hide first-run failures.

Playwright saves screenshots for every test, additional dark/light/native-canvas
and cross-origin-embed screenshots, an HTML report, and failure traces/video. CI
uploads those real browser artifacts plus application/worker logs even on failure.
Run `npx playwright show-report` to inspect a downloaded report.

A restricted runtime that cannot launch Chromium (for example, denied Unix-domain
socket namespaces) cannot establish a browser pass. `npx playwright test --list`
only validates discovery/configuration and must not be reported as browser
execution. The Ubuntu CI job is the real-browser acceptance gate; a committed CI
workflow is not evidence of a green run until GitHub reports that run's result.

The independent `compose` CI job also builds the real Docker deployment images,
starts the complete Compose stack with a disposable local-storage configuration,
runs committed migrations, seeds through the non-root web container, and checks
production assets/health from the host. It retains container logs and always
removes the temporary containers and volumes. This smoke test does not substitute
for B2 credentials or a production deployment; that environment still needs its
own configuration and verification.
