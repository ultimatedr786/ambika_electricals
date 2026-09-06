# Rewardly — Ambika Electricals

A loyalty and point-of-sale companion for an electrical retailer in Gujarat.
Next.js 16 + React 19 on the front, Supabase (PostgreSQL, Auth, RLS, Realtime,
Storage) behind it.

**Rewardly is not the invoice of record.** The shop's existing billing system
stays authoritative for GST; Rewardly records the loyalty side of the same
transaction and can be down without stopping a sale.

---

## Quick start

```bash
npm ci
npm run dev          # http://localhost:3000
```

With no Supabase credentials the app runs its **demo/mock fallback** — a fully
navigable prototype with seeded data. That is the intended experience for a
fresh clone, and it is what CI builds against.

To run against a real Supabase project, copy `.env.example` to `.env.local` and
fill it in. See `SETUP_SUPABASE_AND_RESEND.md` for the owner-side setup and
`OWNER_ACTION_CHECKLIST.md` for what only the owner can do.

---

## Checks

| Command | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript, no emit |
| `npm run lint` | ESLint |
| `npm test` | Unit tests (redaction, QR format, notification merge, QR image decode) |
| `npm run build` | Production build |
| `npm run smoke` | 39 route/redirect checks against a running server |
| `npm run test:ui` | Playwright UI acceptance gate — desktop light/dark + mobile |
| `npm run audit:a11y` | axe-core + timings on the five critical flows → `PERFORMANCE_A11Y_AUDIT.md` |
| `npm run scan:secrets` | Repository secret scan (offline, no third-party service) |

Database suites need PostgreSQL. No Docker required:

```bash
npm run db:start     # throwaway server on 127.0.0.1:54329 — keep this running
npm run test:rls     # 109-case RLS policy harness
npm run test:pgtap   # pgTAP suite (local stubs; CI runs the real extension)
```

`npm run db:start` writes to `.tmp-testdb/` (git-ignored) and can be deleted at
any time — every suite creates its own throwaway database.

Everything above runs in CI on every pull request. See `OPERATIONS.md` §6 for
what each CI job proves, and why the `database` job uses a real PostgreSQL
image rather than the local stub runner.

---

## Repository map

| Path | What lives there |
| --- | --- |
| `src/app` | Routes. `business/` is the staff app, `customer/` the member app |
| `src/components` | UI. `ui/` is the primitive layer; `live-*` components are the Supabase-backed surfaces that render only when configured |
| `src/lib` | Services, auth/session, Supabase clients, notification and QR logic, observability |
| `supabase/migrations` | The schema. Forward-only, ordered by filename timestamp |
| `supabase/tests` | pgTAP suite mirroring the RLS policy matrix |
| `scripts/rls-check` | Plain-SQL RLS harness (109 cases) and the pgTAP runner |
| `scripts/ci` | Migration/schema validation and the secret scanner |
| `scripts/audit` | The accessibility/performance audit that generates the report |
| `tests/ui` | Playwright acceptance gate |

---

## Documentation

| Document | Read it when |
| --- | --- |
| `FINAL_MVP_LAUNCH_COMPLETION.md` | You want the scope this MVP was built to |
| `OPERATIONS.md` | Running it: health checks, logging, backups, rollback, CI |
| `RELEASE_CHECKLISTS.md` | Shipping it: staging/UAT and production |
| `RLS_POLICIES.md` | Who can see and do what, and why |
| `RLS_TEST_RESULTS.md` | The evidence behind those claims, run by run |
| `PERFORMANCE_A11Y_AUDIT.md` | Current accessibility and performance baseline |
| `OWNER_ACTION_CHECKLIST.md` | External setup the agent cannot do |
| `PROJECT_BRIEF.md`, `PHASE_2_ARCHITECTURE_PROPOSAL.md` | Background and design intent |

---

## Conventions worth knowing before changing anything

- **The database is the source of truth.** Money and points are computed by
  SECURITY DEFINER RPCs; the browser shows previews and the server's response
  is what gets stored.
- **Writes go through RPCs.** API roles hold almost no direct DML, and
  `scripts/ci/validate-migrations.mjs` fails the build if that slips.
- **Append-only where it matters.** `points_ledger`, `audit_logs`,
  `inventory_movements` and `qr_verification_attempts` have immutability
  triggers that refuse even the table owner.
- **An RPC that must leave evidence cannot raise.** A raise rolls back the
  audit row it just wrote, so verification and expiry paths return
  `{ok:false, reason}` instead. See `RLS_POLICIES.md` §4.
- **Demo fallback is a supported state**, not a development shortcut. Every
  `live-*` component returns `null` when Supabase is unconfigured.
