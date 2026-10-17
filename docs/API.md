# Komfyflow API

All responses are JSON unless noted. Errors are `{error,code}` with appropriate 400/401/403/404/409/413/429/500 status. Responses containing account or workflow information use `Cache-Control: private, no-store`. Mutation requests require an `Origin` matching `APP_URL`; browser same-origin fetch supplies it automatically. Authentication uses an HTTP-only, SameSite=Lax session cookie, Secure in production. No bearer token is exposed to the UI.

## Authentication and preferences

| Method and path           | Input                             | Result                                                       |
| ------------------------- | --------------------------------- | ------------------------------------------------------------ |
| POST `/api/auth/register` | `{username,email,password}`       | 201 `{user,emailSent,message}`; session + verification email |
| POST `/api/auth/login`    | `{identifier,password}`           | `{user}`; identifier accepts username or email               |
| POST `/api/auth/logout`   | `{}`                              | `{ok:true}`; revoke session                                  |
| GET `/api/auth/me`        | —                                 | `{user:null\|User}`                                          |
| PATCH `/api/auth/me`      | `{displayName?,bio?,adultOptIn?}` | `{user}`                                                     |
| POST `/api/auth/verify`   | `{token}`                         | Consume one-time email token                                 |
| POST `/api/auth/resend`   | `{}`                              | Authenticated verification resend                            |
| POST `/api/auth/recover`  | `{email}`                         | Enumeration-safe generic response                            |
| POST `/api/auth/reset`    | `{token,password}`                | Consume token, change password, revoke all sessions          |
| POST `/api/preferences`   | `{adultOptIn:boolean}`            | Account preference or signed guest cookie                    |

Passwords require 12–128 characters and are stored as randomly salted scrypt hashes. User output excludes password/session/token hashes. Verification tokens expire after 24 hours; reset tokens after one hour. Sessions expire after 30 days. Username is 3–40 ASCII letters, digits or underscores, normalized lowercase.

## Discovery and workflow detail

- GET `/api/workflows` or `/api/search`: `q`, `category`, `tag`, `sort=newest|popular`, `page` (24/page). Returns `{workflows,page,hasMore}`. Search matches title, description, tags and analyzed model filenames, package names and node types. Model/dependency search currently examines JSON reports with a 5,000 matching-workflow cap; install an indexed search projection before large-scale deployment.
- GET `/api/workflows/:id`: `{workflow}` including all owner-visible versions, `liked`, `bookmarked`. An authenticated detail view records history.
- POST `/api/workflows`: multipart `file`, `title`, `description`, `category`, `tags` (comma separated), `visibility=PUBLIC|PRIVATE|UNLISTED`, `adult=true|false`; returns 201 `{workflow}`. File is JSON or workflow-bearing PNG, at most 20 MiB. Default visibility is PRIVATE.
- PATCH `/api/workflows/:id`: owner metadata changes using the same fields; tags are an array in JSON.
- GET `/api/workflows/:id/versions`: `{versions}`. Counts `nodes` and `links` are numbers, not graph arrays.
- POST `/api/workflows/:id/versions`: owner-only multipart `file`. Appends a new immutable original/version; does not overwrite prior bytes.
- GET `/api/workflows/:id/source?version=ID`: sanitized native-compatible preview graph. This is **not** the original download: callback, configuration, extension and arbitrary URL/image fields are stripped. Bounded positional and named widget values and API input literals are retained as inert data for native display. It uses the same visibility/adult gates as the original, so public workflow prompts may be visible. Analysis reports separately redact nonessential input/widget values.
- GET `/api/workflows/:id/download?version=ID`: exact original bytes as an attachment; SHA-256 records original bytes.
- GET `/api/workflows/:id/embed?version=ID`: access-controlled preview metadata/report.
- POST `/api/workflows/:id/reanalyze`: owner `{versionId?}`; queues a fresh analysis, preserving prior run reports. Concurrent requests are atomically rejected while PENDING.
- GET `/api/workflows/:id/runs?version=ID`: `{runs}` newest first, each with `status`, `stage`, `progress`, timestamps, error and historical report. Stages truthfully indicate reading (10), analyzing (35), storing (90), complete (100) or failed. A queue-waiting version is PENDING before its worker run exists.

### Mandatory access and quarantine rules

Adult content is off by default for guests and accounts, including the owner. Signed guest consent or an authenticated account preference is required on discovery, direct links, downloads, source, embed, comments, examples, profiles, bookmarks, history and collections. Private workflows require ownership; unlisted workflows are accessible by direct link but never public discovery.

Only successfully analyzed READY versions are published. Nonowners cannot retrieve a workflow with no READY version and never receive pending/failed versions. Owners can inspect pending/failed status and retry analysis, but original download, source and embed remain quarantined until READY. Example images may reference only READY versions. Reanalysis temporarily quarantines that version until the new run succeeds.

## Community, profiles and libraries

- POST `/api/workflows/:id/like` or `/bookmark`: toggle current user's entry; `{active}`.
- GET `/api/workflows/:id/comments`: `{comments}` with `{id,body,createdAt,user:{username,displayName,avatarUrl}}`.
- POST same: `{body}` (1–3,000 chars); 201 `{comment}`. DELETE same with `?id=COMMENT_ID` removes own comment.
- GET `/api/profiles/:username`: `{profile,workflows}`; profile owner also sees own private/unlisted and queued workflows, subject to adult consent.
- GET `/api/bookmarks`: `{workflows}`.
- GET `/api/history`: `{history:[{workflow,viewedAt,...}]}`; DELETE clears own history.
- GET `/api/collections`: `{collections}` including adult/access-filtered `_count.items`.
- POST `/api/collections`: `{name}`; 201 `{collection}`.
- GET `/api/collections/:id`: owner-only `{collection:{...,items:[{workflow,...}]}}`.
- POST same: `{workflowId}` to add; PATCH `{name}` to rename.
- DELETE same with `?workflowId=ID` removes an item; without query deletes collection.

## Example images

GET `/api/workflows/:id/examples` returns `{examples:[{id,caption,versionId,url,...}]}`. POST owner multipart `file`, `caption`, optional `versionId`; 201 `{example}`. Images are limited to 10 MiB and 40 million decoded pixels, must be PNG/JPEG/WebP, and cannot be animated/multipage. They are decoded and re-encoded to WebP without EXIF/ICC/XMP/IPTC metadata. GET returned `url` streams the sanitized raster after checking workflow access. DELETE same endpoint `?id=IMAGE_ID` removes the owner's image. Original image metadata is never published.

## Runtime and deployment requirements

- `DATABASE_URL`: MariaDB/MySQL Prisma connection URL. Apply committed migrations with `prisma migrate deploy`; seed illustrative samples via `npm run db:seed`.
- `APP_URL`: exact public origin, also used for email links.
- `SESSION_SECRET`: strong random signing secret, required in production.
- `REDIS_URL`: required in production for BullMQ and atomic shared rate limiting. Run the separate worker (`npm run worker`). Without Redis, development analyzes inline and uses local memory rate limits.
- `REQUIRE_VERIFIED_UPLOADS=true`: require verified email before upload; enable for an internet-facing deployment.
- `TRUST_PROXY=true`: only behind a trusted proxy that overwrites forwarded client-IP headers. Never trust user-supplied forwarded headers directly.
- `MAIL_WEBHOOK_URL`, `MAIL_WEBHOOK_TOKEN`: transactional-email adapter. POST receives JSON `{to,template:'verify'|'reset',link}` with `Authorization: Bearer TOKEN`. Adapter delivers the corresponding email and returns success. Development without adapter logs links locally; production without adapter cannot deliver email. Registration reports delivery failure rather than claiming it sent.
- `STORAGE_DRIVER=b2`: configure `B2_ENDPOINT`, `B2_REGION`, `B2_BUCKET`, `B2_KEY_ID`, `B2_APPLICATION_KEY`. The bucket **must be private**, with least-privilege application credentials. Files are fetched only through authorized API handlers, never public bucket URLs.
- Development `STORAGE_DRIVER=local`, `STORAGE_DIR=.data/uploads`: private filesystem outside public assets, exclusive-create object writes. Production refuses local storage unless deliberately overridden with `ALLOW_LOCAL_STORAGE=true`.
- GET `/api/health`: database + Redis readiness; 503 with generic unavailable response on failure. It does not prove mail delivery, B2 access, or worker health.

B2 live operations require deployment credentials and were not exercised by the local acceptance suite. Test bucket privacy, credential restrictions, upload/read/cleanup and storage failure behavior before deployment. Keep backups, lifecycle policy, email delivery monitoring and worker monitoring under operator control.

## Tests

`npm test` covers security primitives, access matrix, actual protected route handlers, bounded input, image decoding/metadata stripping, analyzer and worker behavior. `tests/integration/api-smoke.ts` exercises a live migrated/seeded MariaDB + Redis + web + worker stack. It starts a local email capture server on port 3101; set the web process and test process `MAIL_WEBHOOK_URL=http://127.0.0.1:3101/mail`, `MAIL_WEBHOOK_TOKEN=integration-mail-secret`, and matching `TEST_BASE_URL`/`APP_URL`. It creates synthetic accounts, verifies actual email webhook tokens and recovery, checks protected surfaces, immutable downloads, versions/reanalysis and image sanitation, then deletes its test accounts. Use a disposable database/storage for this suite.
