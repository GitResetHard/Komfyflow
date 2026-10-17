# Current-source verification

Verified 2026-10-18 (UTC+03:00). This report separates implementation, automated checks and deployment gates.

## Passed locally

- Root lockfile consistency: `npm ci --dry-run --ignore-scripts`.
- Prisma 7.10.1 client generation and strict application TypeScript checking.
- `npm test`: 135 tests across 12 suites, including malicious uploads, access control, analysis, current-format preview preservation and UI components. Component tests use jsdom, not a browser.
- Production build with Next.js 16.4.2, React 19.3.1 and the current native viewer. Static assets are copied into the standalone runtime.
- Fresh migration and seed on real MariaDB 11.8.8, Redis 8.0.2, separate TypeScript analysis worker and production standalone server.
- 115 live API checks: authentication, local mail verification/recovery, quarantine, access/adult filtering, workflow versions, immutable original downloads, analysis/progress/reanalysis, model search, profiles, community, collections, history and sanitized example images. Current named/positional widget values and older-preview reprojection are explicitly checked.
- 14 live Redis security assertions across independent Node processes.
- 20 production HTTP/assets checks for pages, health, compiled CSS, native viewer assets and framing/CSP headers.
- `npm audit`: zero reported vulnerabilities across production and development dependencies.

The API counter includes asynchronous polling assertions, so repeated runs may report a slightly different count while exercising the same scenarios.

## Current native viewer

Pinned source: Comfy-Org/ComfyUI_frontend `a8e134a988495b2e22979458b41f561083cb5d5b`, `src/lib/litegraph`. Current native nodes, canvas, subgraphs, groups and reroutes remain. Original connection-line drawing and original semantic state/layout/widget adapters replace host application imports outside the MIT subtree. Unknown imports fail the bundle audit. Mandatory upstream copyright/license notices are preserved.

Native tests configure actual native graphs/subgraphs and draw the native canvas against a recording context, alongside sanitizer and adapter regressions. This is substantive runtime coverage, but not visual browser verification. `npm run test:viewer`: 54 tests passed. The final self-contained bundle audits 719 input modules.

## Browser CI and external gates

[Successful complete run 39077826957](https://github.com/GitResetHard/Komfyflow/actions/runs/39077826957), source commit `c6752af596104c1857c3059200ec4b30c089f031`:

- 135 application/security/UI tests and 54 actual native viewer/adapter tests.
- Strict TypeScript, locked dependency installation and production build.
- 115 live API, 14 cross-process Redis and 20 production HTTP/assets checks.
- All 12 real Chromium desktop/mobile journeys passed, including authentication, search, persistent light/dark/accent state, actual native canvas painting and cross-origin embeds.
- Actual Docker image build and Compose deployment passed, including database/Redis/migration, non-root web/worker, seed and deployed HTTP/native assets.
- Downloaded real screenshots were visually inspected for desktop workflow nodes/text/connections, mobile high-DPI embedded canvas, and warm-light/teal discovery. Native viewport regressions explicitly cover DPR 1, 2, 2.625 and 3; browser raster probes cover the full physical canvas, not only its top-left corner.

The GitHub run retains browser screenshots/reports and deployment evidence for 14 days. This is real remote Chromium verification, not a local mock browser. The restricted local environment could not launch Chromium; GitHub Actions supplied the supported browser and Docker runtime.

### Remaining operator gates

1. Live private Backblaze B2 bucket, credentials, scoped key permissions and immutable writes. Local storage was tested, not a real B2 account.
2. External email delivery and inbox arrival. Actual transport was verified against a local capture service only.
3. Public TLS, proxy trust, backups/restore, operational monitoring, load testing and moderation. No external infrastructure/accounts have been provisioned.
4. Unsupported extension widgets remain inert text placeholders. The viewer never executes workflows or imports extension code and does not promise pixel-identical custom extension UI.

## Reproduction

See README.md and docs/API.md. Against a disposable configured instance run `npm run test:api`, `npm run test:redis` and `npm run test:runtime`, matching TEST_BASE_URL to APP_URL. The API suite requires its local mail capture configured on the server.

`scripts/local-integration-harness.sh` is sandbox-specific, starts unpacked official service binaries under `/tmp`, and deliberately resets its disposable database. Never point it at real data. Normal deployment uses the documented service setup or Docker Compose.

Production readiness is conditional on the explicit external operator gates, not inferred from a successful build.

## Dependency selection

The npm registry was checked during this revision: Next 16.4.2 and React 19.3.1 were the stable published releases selected. Prisma 7.10.1 was selected rather than the Prisma 8 release-candidate dist-tag. Viewer dependencies use patched Vue 3.5.44, DOMPurify 3.4.17 and es-toolkit 1.52.0; the workspace has one root lockfile. Node typings match the deployed Node 24 major. Existing TypeScript 5.9, BullMQ 5, ioredis 5 and Zod 3 API contracts are retained deliberately rather than performing unrelated breaking-major migrations; audit and production integration pass with these locked versions. This is a compatibility choice, not a claim that every dependency is its newest major.
