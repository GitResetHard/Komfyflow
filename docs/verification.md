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

Native tests configure actual native graphs/subgraphs and draw the native canvas against a recording context, alongside sanitizer and adapter regressions. This is substantive runtime coverage, but not visual browser verification. `npm run test:viewer`: 54 tests passed. The final self-contained bundle audits 718 input modules.

## Browser CI and external gates

GitHub Actions runs the full build/API/security suite and 12 Playwright desktop/mobile journeys, plus an independent actual Docker Compose build/start/seed/HTTP smoke job. Test discovery, configuration parsing and strict TypeScript checking pass locally. Actual browser execution remains pending the first remote CI run; no CI pass is claimed in advance.

1. Local Chromium cannot create its required Unix socket; the separate supported cloud browser cannot reach this task's isolated localhost. No local screenshot or visual-browser pass is claimed.
2. Live private Backblaze B2 bucket, credentials, scoped key permissions and immutable writes need operator verification. Local storage was tested.
3. External email delivery and inbox arrival need provider configuration. Actual HTTP transport was tested against a local capture service only.
4. No Docker daemon is available here. The independent Compose CI job must pass before claiming image build/runtime verification; configuration and native service execution alone do not establish it.
5. Public TLS, proxy trust, backups/restore, operational monitoring, load testing and moderation remain deployment requirements. No external service accounts or infrastructure have been provisioned.
6. Unsupported extension widgets render as inert text placeholders. This viewer never executes workflows, imports extensions or promises pixel-identical custom extension UI.

## Reproduction

See README.md and docs/API.md. Against a disposable configured instance run `npm run test:api`, `npm run test:redis` and `npm run test:runtime`, matching TEST_BASE_URL to APP_URL. The API suite requires its local mail capture configured on the server.

`scripts/local-integration-harness.sh` is sandbox-specific, starts unpacked official service binaries under `/tmp`, and deliberately resets its disposable database. Never point it at real data. Normal deployment uses the documented service setup or Docker Compose.

Production readiness is conditional on the explicit external and browser gates, not inferred from a successful build.

## Dependency selection

The npm registry was checked during this revision: Next 16.4.2 and React 19.3.1 were the stable published releases selected. Prisma 7.10.1 was selected rather than the Prisma 8 release-candidate dist-tag. Viewer dependencies use patched Vue 3.5.44, DOMPurify 3.4.17 and es-toolkit 1.52.0; the workspace has one root lockfile. Node typings match the deployed Node 24 major. Existing TypeScript 5.9, BullMQ 5, ioredis 5 and Zod 3 API contracts are retained deliberately rather than performing unrelated breaking-major migrations; audit and production integration pass with these locked versions. This is a compatibility choice, not a claim that every dependency is its newest major.
