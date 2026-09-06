# Operations manual — Rewardly (Ambika Electricals)

Everything an operator needs that is not in the code: how the system is
observed, how it is checked, how it is deployed, and what to do when something
breaks. Written for the person on call, not for a compliance folder.

Companion documents:

- `RELEASE_CHECKLISTS.md` — staging/UAT and production deployment checklists.
- `PERFORMANCE_A11Y_AUDIT.md` — generated audit of the critical flows.
- `OWNER_ACTION_CHECKLIST.md` — the external setup only the owner can do.
- `RLS_POLICIES.md` / `RLS_TEST_RESULTS.md` — the security model and its evidence.

---

## 1. What runs where

| Piece | What it is | Failure mode |
| --- | --- | --- |
| Next.js app | The whole UI plus server actions and route handlers | The shop cannot use Rewardly; **billing is unaffected** — Rewardly is not the invoice of record |
| Supabase PostgreSQL | Every authoritative record: sales, ledger, redemptions, rules | Loyalty is read-only at best; staff fall back to recording the sale in the billing system and enrolling points later |
| Supabase Auth | Sign-in for staff and customers | Nobody can sign in; existing sessions continue until their token expires |
| Supabase Realtime | Live notification delivery | Notifications still arrive on refresh — the UI degrades to a visible "Reconnecting…" state, never to silence |
| Supabase Storage | Product/reward images | Illustrations render instead; nothing else is affected |

**The important property:** with Supabase unconfigured or unreachable at build
time the app runs its demo/mock fallback. A preview deployment is therefore
always serviceable, and a misconfigured environment variable never produces a
white screen.

---

## 2. Health and readiness

Two endpoints, deliberately different:

| Endpoint | Question | Touches the database? | Use for |
| --- | --- | --- | --- |
| `GET /api/health` | Is the process alive and serving HTTP? | No | Liveness / restart policy |
| `GET /api/ready` | Should this instance receive traffic? | Yes (a cheap PostgREST ping) | Readiness / load-balancer rotation |

`/api/health` must never depend on a downstream service: a liveness probe that
checks the database will restart perfectly healthy containers during somebody
else's outage.

`/api/ready` returns `200 {"status":"ready","mode":"demo"}` when Supabase is
unconfigured — the mock fallback is a valid serving state, and reporting
"not ready" would make previews un-routable. It returns `503
{"status":"degraded"}` when Supabase is configured but unreachable. The reason
goes to the logs, never to the response body: an unauthenticated endpoint is a
reconnaissance surface.

**Suggested platform configuration**

```
liveness   GET /api/health   period 30s   timeout 3s    failures 3 → restart
readiness  GET /api/ready    period 15s   timeout 5s    failures 2 → out of rotation
```

---

## 3. Structured logging and error tracking

### What exists

`src/lib/observability/logger.ts` emits one JSON object per line to
stdout/stderr — the format every serverless host already collects, and one a
log drain can index without a custom parser.

```ts
import { log } from "@/lib/observability/logger";

log.info("sale recorded", { scope: "pos", businessId, invoiceNo, totalPaise });
log.error("readiness: could not reach Supabase", { scope: "health", error });
```

`LOG_LEVEL` (`debug|info|warn|error`) controls the floor; production defaults
to `info`. `warn` and `error` go to stderr so hosts that split streams classify
them correctly.

### Redaction is the part that matters

`src/lib/observability/redact.ts` runs over every payload, using **two
independent mechanisms** because each misses what the other catches:

- **By key name** — `password`, `token`, `authorization`, `apikey`,
  `service_role`, `cookie`, `code_hash`, `email`, `phone`, `gstin`, … A key
  that names a credential is redacted wholesale, container and all.
- **By value shape** — JWTs, `RWD1.…` membership QR tokens, `sb_secret_…`,
  Resend keys, email addresses, Indian mobile numbers.

Specifically protected because they are *capabilities, not just data*:

| Value | Why |
| --- | --- |
| Supabase service-role key | Bypasses RLS entirely |
| Membership QR token | The token **is** the identity proof (§3) |
| Redemption collection code | The code **is** the entitlement (§8.4) |
| Customer phone / email | Stored masked in the database; logging the raw value would undo that |

Redaction is unit-tested (`tests/logger-redaction.test.mjs`), including that it
never throws on cyclic, deep or unserializable input. A logger that can crash
the request it is describing is worse than no logger.

### Error tracking — design, and why it is not wired up

The integration point is a single call inside `emit()` in `logger.ts`. It is
deliberately **not** connected, because choosing a vendor, creating the
project and holding its DSN are owner actions.

When the owner is ready:

1. Create the project (Sentry, Axiom, Better Stack — all work with this shape).
2. Add the DSN as a server-side environment variable. It must **not** be
   `NEXT_PUBLIC_`-prefixed unless browser errors are also wanted, and if they
   are, enable the vendor's own scrubbing as well as ours.
3. In `emit()`, forward `level === "error"` lines to the vendor — passing the
   **already-redacted** object, never the raw one.
4. Set the release/commit SHA so stack traces map to source.

Rules that must survive that integration:

- Send the redacted payload. The vendor's scrubbing is a second net, not the
  first one.
- Never attach the service-role client or a raw request body.
- Sample `info`, keep 100% of `error`.

---

## 4. Backups, restore and rollback

### Backups

Supabase takes automated backups on paid plans; on Free there are none, which
is the single strongest argument for putting production on at least Pro before
go-live.

| Item | Setting |
| --- | --- |
| Automated daily backups | Enable in Supabase → Database → Backups |
| Point-in-time recovery (PITR) | Enable on production. Loyalty balances are money-adjacent; "restore to yesterday" is not good enough |
| Retention | ≥ 7 days, ideally 30 |
| Pre-deployment snapshot | Manual, immediately before every production migration (see the checklist) |
| Restore rehearsal | Once before launch and once a quarter — an untested backup is a rumour |

### What a restore actually costs

Because the ledger is append-only and every mutation is audited, a
point-in-time restore loses transactions but never corrupts them. After a
restore:

1. Compare `points_ledger` max `id` against the last known invoice in the
   billing system.
2. Re-enter sales recorded in the gap; `create_sale` is idempotent on its key,
   so a partially-replayed batch will not double-post.
3. Re-issue any redemption codes handed out during the gap
   (`redemptions.reference` shows what existed).

### Migration rollback

Migrations are forward-only by design. There are no `down` scripts, and that is
deliberate: a generated `down` that drops a column is how you turn a bad deploy
into data loss.

**The rollback plan is therefore:**

| Situation | Action |
| --- | --- |
| Migration failed mid-apply | Supabase applies each migration in a transaction — it rolled back on its own. Fix and re-apply |
| Migration applied, app broken | **Roll back the app deployment, not the database.** Every migration in this project is additive or permission-tightening, so the previous app version keeps working against the new schema |
| Migration applied and actively harmful | Write a new forward migration that reverses the effect, review it like any other change, then deploy |
| Data corrupted | PITR restore to just before the deploy, then replay per above |

This works because of a rule the schema follows throughout: **new columns are
nullable or defaulted, and nothing is dropped in the same release that stops
using it.** The one exception was `businesses.earn_spend_paise`/`earn_points`,
dropped in the same migration that backfilled its replacement — acceptable only
because nothing had shipped to production yet. After launch, split that into
two releases.

---

## 5. Secret management

- **Never** commit a key. `npm run scan:secrets` runs in CI and can be run
  locally; it exits non-zero and prints a *redacted* excerpt.
- Enable **GitHub secret scanning and push protection** on the repository. Our
  scanner is a floor, not a replacement — it only sees what reaches the repo.
- The service-role key is server-only. `src/lib/supabase/admin.ts` is
  `server-only`, so importing it into a client component is a build error
  rather than a leak.
- Rotation: Supabase → Settings → API → roll the key, update the deployment
  environment, redeploy. Rotate immediately if a key ever appears in a log, a
  screenshot, a ticket or a chat message.
- If a key leaks: **rotate first**, then clean history. The reverse order
  leaves a valid key in a public place while you rewrite commits.

---

## 6. Running the checks

### Locally

```bash
npm ci
npm run typecheck        # TypeScript
npm run lint             # ESLint
npm test                 # unit tests (redaction, QR format, notification merge…)
npm run build            # production build
npm start &              # then:
npm run smoke            # 39 route/redirect checks
npm run test:ui          # Playwright UI acceptance gate (desktop + mobile)
npm run audit:a11y       # axe-core + timings → PERFORMANCE_A11Y_AUDIT.md
npm run scan:secrets     # repository secret scan
```

Database suites need a PostgreSQL to talk to:

```bash
npm run db:start         # throwaway server on 127.0.0.1:54329 (keep running)
npm run test:rls         # 109-case RLS policy harness
npm run test:pgtap       # the pgTAP suite via local stubs
```

`npm run db:start` uses an embedded PostgreSQL and needs no Docker. Its data
lives in `.tmp-testdb/` (git-ignored) and can be deleted at any time.

### In CI

`.github/workflows/ci.yml` runs on every pull request and every push to `main`:

| Job | What it proves |
| --- | --- |
| `quality` | Types, lint, unit tests, a production build, and 39 route smoke checks against the built server |
| `database` | Migrations apply to an empty **real** PostgreSQL (the image Supabase runs), schema invariants hold, the RLS harness passes, and the pgTAP suite passes against the **real pgTAP extension** — not the local stubs |
| `ui` | The MVP UI acceptance gate in a real browser, desktop light/dark and mobile |
| `security` | Repository secret scan, `npm audit` at high severity, and dependency review on PRs |

The `database` job is the one that answers §7's "do not rely only on a local
pgTAP stub runner". The stub runner exists for laptops without Docker; CI runs
the genuine article.

### Schema invariants enforced by `scripts/ci/validate-migrations.mjs`

Beyond "the SQL parses", every run asserts:

1. Every migration filename is `<14-digit timestamp>_<snake_case>.sql` and no
   two share a timestamp (otherwise apply order is undefined).
2. Every table in `public` has row level security **enabled**.
3. No API role holds `INSERT`/`UPDATE`/`DELETE` except on the three tables
   where direct writes are a deliberate design decision.
4. `anon` holds **no** table grants at all.
5. Every `SECURITY DEFINER` function pins `search_path` — without it, a caller
   can hijack the function through a schema they control.

Invariant 3 is not theoretical: it is what caught `businesses.UPDATE` and
`stores.INSERT/UPDATE` still being granted after the settings RPCs took over,
which would have let an owner change tenant configuration without leaving an
audit entry. That became migration `20260906200000_tighten_settings_grants.sql`.

---

## 7. Deploying migrations: staging, then production

Migrations live in `supabase/migrations/` and are applied with the Supabase
CLI. **Never** edit a migration that has been applied to any shared
environment; add a new one.

```bash
# once per machine
npm i -g supabase
supabase login

# staging
supabase link --project-ref <staging-ref>
supabase db diff --linked            # confirm the CLI sees what you expect
supabase db push                     # apply pending migrations
supabase test db                     # real pgTAP against staging

# production — only after staging + UAT sign-off
supabase link --project-ref <production-ref>
supabase db push
```

Order of operations for any release that includes a migration:

1. Take a manual backup snapshot of production.
2. Apply migrations **before** deploying the new app build. Every migration
   here is additive or permission-tightening, so the currently-running app
   keeps working against the new schema — which is what makes an app-only
   rollback a viable escape hatch.
3. Deploy the app.
4. Watch `/api/ready` and the error stream for ten minutes.

---

## 8. When something breaks

| Symptom | First check | Likely cause |
| --- | --- | --- |
| Everyone signed out | Supabase Auth status | Auth outage, or `NEXT_PUBLIC_SUPABASE_URL` changed |
| `/api/ready` returns 503 | Supabase project status page | Database paused (Free tier), connection limit, or network |
| Sales fail with "Something went wrong" | Server logs, filter `scope=pos` | An RPC raised — the typed reason is in the log line |
| Points look wrong | `points_ledger` for that membership | The ledger is append-only and authoritative; the balance cache is derived. Never edit the cache — post an `adjust_points` correction |
| A member's QR always fails | `qr_verification_attempts` for that scanner | Expired/consumed token (normal), or a rate limit (40/min per staff profile) |
| Notifications stopped | The bell shows its own connection state | Realtime dropped; the list still refreshes on navigation |
| Images 404 | Storage bucket policies | Bucket missing, or the object path does not start with the business id |

**Escalation rule:** Rewardly is not the GST invoice of record. If loyalty is
down, the shop keeps selling through the billing system and enrols points
afterwards — `create_sale` is idempotent, so a catch-up batch cannot
double-award. Never hold up a customer at the counter for a loyalty outage.
