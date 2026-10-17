# Security review and release gate

Status: source-level security review and local automated verification completed for the current implementation. This is not an independent penetration test or production certification. Do not publish until the remaining deployment gates below have been verified against the deployed configuration.

## Security invariants

- Adult content is hidden by default for guests and new accounts, including search, category/tag listings, profiles, collections, bookmarks/history, recommendations, detail APIs, metadata and download endpoints. Opt-in is explicit and account-scoped.
- Private content is available only to its owner. Unlisted content is accessible by direct identifier but excluded from public discovery. Every source download and analysis response repeats the access check; an object key is not authorization.
- Source JSON and PNG originals live in a private bucket. Browser rendering uses sanitized analysis/preview data. Never expose source keys, original URLs, provider errors or sensitive prompt values through public indexes.
- Uploaded graphs are data, never instructions. Never import custom node code, invoke shell commands from graph values, fetch arbitrary model/node URLs, or render user HTML.
- Untrusted JSON/PNG metadata parsing has byte, nesting, node, edge and decompression bounds; example raster decoding additionally has a pixel limit; dangerous object keys and malformed metadata cannot poison application objects. Filenames cannot select filesystem paths or object keys.
- Sessions are random opaque values stored as hashes, with expiry and secure cookies. State changes enforce same-origin/CSRF checks. Authentication and recovery are throttled; recovery avoids enumeration and uses single-use, expiring, hashed tokens.

## Trust boundaries

Browser/API: IDOR, adult-filter bypass and CSRF require centralized read policy on every route and safe mutations. Upload/parser: oversized/deep JSON, compressed PNG bombs and poisoned keys require early input limits and bounded work. Parser/preview: prompt leakage and stored XSS require an allowlisted representation and text rendering, never raw graph passthrough. API/B2: original disclosure requires private storage, generated keys and authorized mediated download. Worker/queue: malformed jobs require validated identifiers and controlled retries. Authentication: token replay and credential attacks require slow password hashing, random hashed tokens, expiry, invalidation and throttling.

## Automated verification plan

1. Policy matrix for guest, owner, ordinary signed-in and opted-in accounts across public/private/unlisted × safe/adult.
2. Discovery always requires PUBLIC and safe content unless opted in; direct reads do not inherit discovery assumptions.
3. Malformed/oversized JSON, poisoned keys, excessive depth and graph counts.
4. PNG signature, chunk lengths, compressed metadata bombs, encodings and metadata absence.
5. Preview omits prompt text, secrets and arbitrary source fields except specifically intended fields.
6. Original-byte downloads require access approval and safe attachment headers.
7. Password/token/session primitives, CSRF rejection, throttling and reset lifecycle.

## Deployment verification (not satisfied by unit tests)

- Confirm private B2 bucket, least-privilege credentials, no public CDN rule exposing originals, and source URLs absent from API responses.
- Repeat the passing local MariaDB/Redis/API acceptance suite against the release configuration, including real production mail and B2 adapters. The local mail capture is not proof of production email deliverability.
- Validate HTTPS, Secure/HttpOnly/SameSite cookies, proxy/client-IP trust and CORS/origin settings.
- Test reverse-proxy and worker limits, including multipart limits before form parsing and concurrent parsing.
- Confirm viewer sandbox/CSP prevents navigation, external requests and executable graph material.
- Scan dependencies/image, rotate test credentials and ensure SMTP/recovery tokens never leak in public logs.

## Implemented review corrections

- JSON API bodies now enforce a 64 KiB actual-byte stream limit even when Content-Length is missing or false; malformed UTF-8 is rejected.
- Visibility checks fail closed for unknown values. Adult checks run before owner/private checks. Discovery requires a READY version. Nonowners cannot inspect PENDING/FAILED versions; source, embed and original download remain blocked until READY even for the owner. Owners can inspect failure state and request a retry.
- Rate limits use atomic shared Redis INCR + PEXPIRE counters when configured and fail closed on backend failure. Production rejects missing Redis; bounded in-memory counters are development-only. Redis keys hash account identifiers.
- Signed guest preference rejects unequal UTF-8 byte lengths safely; production rejects missing, short and template secrets.
- Password reset consumes its hashed, expiring token atomically in the same transaction as password replacement and session invalidation.
- No workflow execution, package installation, model download or arbitrary URL fetch was found in the analysis path.

## Automated results recorded during review

Executed `npx vitest run tests/security`: 90 tests passed across eight files (access/discovery matrix, hostile uploads, JSON body cap, cryptographic/origin/throttling primitives, mocked Redis success/failure, and protected route handlers rejecting denied reads before storage access; real sharp example-image decoding/metadata stripping, and quarantine authorization/delivery). `npx tsc --noEmit` emitted no errors at the same checkpoint. These are unit checks, not a claim that production services, B2 or browser flows passed integration.

## Dependency overrides

Patched postcss and deepmerge-ts overrides are present after dependency audit findings. Treat overrides as an explicit maintenance obligation: retain the lockfile, rerun production audit and build/tests after upgrades, and remove an override only once the transitive dependency itself resolves to a non-vulnerable supported version. A clean audit is not a substitute for application access-control review.

## Cross-worker findings and resolution status

- Viewer owner fixed output slot indexes to 0–99 and added a global 2,000-node / 100-subgraph budget, with native-engine regression tests.
- Example image uploads now decode with sharp under a 40-million-pixel limit, reject multipage inputs, and re-encode to WebP without source metadata. Four actual route tests verify EXIF stripping, false signatures, huge PNG dimensions, owner authorization and generated object keys.
- Analysis owner redacted report inputs/widgets and backend source applies a bounded structural graph projection preserving inert positional/named values behind the same access controls; original-byte downloads remain separate and authorized. Structural labels and filenames remain visible intentionally and can themselves contain user text.

Local live verification: the integration harness successfully ran tests/integration/security-redis.ts, passing 14 assertions against real Redis with independent Node processes: atomic shared limits, counter expiry, fail-closed configuration, signed adult preference validation and stable session-token hashing. The earlier integration checkpoint verified 110 passing live HTTP API assertions in the built production-mode standalone runtime using real MariaDB, Redis, a local transactional-mail capture and sharp. The final suite includes quarantine, model metadata search and persisted analysis progress after all schema changes. Another 20 production HTTP checks verified pages, compiled CSS, native viewer assets and framing headers. These results do not establish live B2 permissions, production mail delivery, public TLS/proxy configuration or Docker runtime correctness.

## Proxy requirements

When TRUST_PROXY is false, requests share a conservative local IP bucket. Set TRUST_PROXY=true only behind a reverse proxy that overwrites X-Forwarded-For and prevents direct application access. Do not trust arbitrary client-supplied forwarding headers. Production mail webhooks must use HTTPS; deployment must run check-env before accepting traffic.
