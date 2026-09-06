# MVP handoff — Rewardly for Ambika Electricals

Final report for the work defined in `FINAL_MVP_LAUNCH_COMPLETION.md`. All six
build items are complete, verified and pushed. Item 7 is this document, and the
instruction attached to it is *stop* — nothing on the deferred list has been
started.

**Branch:** `arena/01a07677-ambika-electricals`
**Head:** `c041f9d` (7 commits on top of `854dcf2`)
**Scope of the diff:** 80 files, +13,866 / −513

> **This is not a launch.** The application runs in demo/mock fallback until the
> owner completes the external setup in §7 below. Code completion and production
> readiness are different things, and §8 of the brief is explicit about it.

---

## 1. What was delivered, in the order the document required

| # | Item | Commit | State |
| --- | --- | --- | --- |
| 1 | Mandatory UI hotfixes, real-browser verified | `fbde9cf` | Done |
| 2 | Secure QR token + POS verification | `c9a3152` | Done |
| 2b | Real scannable QR image (approved addition) | `cfbcc0d` | Done |
| 3 | Versioned loyalty-rule engine | `9e777dd` | Done |
| 4 | Realtime persistent notifications | `f91bda7` | Done |
| 5 | Storage/product images + essential settings | `47428fe` | Done |
| 6 | CI, real DB testing, hardening/release docs | `c041f9d` | Done |
| 7 | This handoff | — | You are reading it |

---

## 2. Database — migrations

Twelve migrations, 7,943 lines, forward-only, applied in filename order. The
five in bold are new in this engagement.

| Migration | What it establishes |
| --- | --- |
| `20260905120000_auth_foundation_schema.sql` | Profiles, businesses, stores, memberships, audit log, role helpers |
| `20260905120100_invitations_and_rpcs.sql` | `write_audit`, invitation and membership RPCs |
| `20260905120200_rls_policies.sql` | The base policy matrix and grant floor |
| `20260906120000_points_ledger.sql` | Append-only ledger, balance cache, award/spend/adjust |
| `20260906130000_sales.sql` | Sales, items, payments, per-business invoice counters |
| `20260906140000_inventory.sql` | Products, per-store stock, movements, `create_sale` v2 |
| `20260906150000_rewards_redemptions.sql` | Rewards, holds, redemptions, collection codes |
| **`20260906160000_membership_qr_tokens.sql`** | Opaque single-use QR tokens + append-only scan trail |
| **`20260906170000_loyalty_rules.sql`** | Versioned rule engine; `create_sale` v3; drops the hard-coded earn columns |
| **`20260906180000_notifications.sql`** | Notifications, per-profile read state, six trigger emitters, Realtime publication |
| **`20260906190000_storage_and_settings.sql`** | Catalogue images + Storage policies; identity/store/preference RPCs |
| **`20260906200000_tighten_settings_grants.sql`** | Revokes the last direct-write paths on `businesses` and `stores` |

Current shape: **30 tables · 44 RLS policies · 65 SECURITY DEFINER functions**,
every one of which pins `search_path` (enforced in CI).

### New tables

| Table | Purpose | Notable property |
| --- | --- | --- |
| `membership_qr_tokens` | Live checkout codes | Only `sha256(salt‖secret)` stored; **no SELECT for any API role** |
| `qr_verification_attempts` | Every scan, success or failure | Append-only; manager-visible, cashier-invisible |
| `loyalty_rules` / `loyalty_rule_versions` | The rule series and its immutable versions | `[effective_from, effective_to)` windows; economics immutable even for `postgres` |
| `notifications` | The event | Unique `(business_id, dedupe_key)` makes replay impossible at the storage layer |
| `notification_reads` | Per-profile read state | Separate table so one event can be read independently by many staff |
| `catalogue_images` | Image metadata | `path` CHECKed to start with `business_id/`; one thumbnail per owner by partial unique index |
| `notification_preferences` | Per-profile muting | `security` can never be muted (CHECK **and** RPC) |

### Columns added to existing tables

- `sales.loyalty_rule_version_id`, `points_ledger.loyalty_rule_version_id` —
  the version that priced each row.
- **Dropped:** `businesses.earn_spend_paise`, `businesses.earn_points`
  (backfilled into rule version 1 first).

---

## 3. Policies and the grant model

Full matrix in `RLS_POLICIES.md`. The rules that govern everything:

1. **Writes go through RPCs.** `authenticated` holds INSERT/UPDATE on exactly
   two tables (`profiles` own-row columns, `customer_memberships` for counter
   enrolment). Nothing else. CI fails the build if that changes.
2. **`anon` holds no table grants at all.**
3. **Append-only means append-only.** `points_ledger`, `audit_logs`,
   `inventory_movements`, `qr_verification_attempts` and
   `loyalty_rule_versions` have triggers that refuse mutation *even for the
   table owner*.
4. **Tenancy is a predicate, not a convention.** Every policy resolves through
   `my_businesses(...)` or an explicit membership check; store-scoped staff are
   confined to their assigned stores.
5. **An RPC that must leave evidence cannot raise.** A raise rolls back the
   audit row it just wrote, so QR verification and lazy expiry return
   `{ok:false, reason}` instead. This is the single most important design rule
   discovered during the work.

---

## 4. Service and RPC contracts

Client-callable RPCs added in this engagement:

| RPC | Who | Returns | Notes |
| --- | --- | --- | --- |
| `issue_membership_qr_token(uuid, integer)` | signed-in customer | `{token, expires_at, ttl_seconds}` | TTL 30–300 s (default 90); 10/min; supersedes the previous token; **raises** on failure |
| `verify_membership_qr_token(text, uuid)` | staff+ of the token's business | `{ok:true, …member}` or `{ok:false, reason}` | Authorizes **before** revealing lifecycle; single-use; 40/min; only `authentication_required` raises |
| `revoke_membership_qr_tokens(text)` | signed-in customer | `integer` (count) | "Hide my QR"; audited per business |
| `set_loyalty_rule(uuid, bigint, integer, integer, bigint, timestamptz, text)` | **owner only** | new version object | Appends vN+1, closes the current one; refuses backdating |
| `current_loyalty_rule(uuid)` / `loyalty_points_for(uuid, bigint)` | any reader | rule JSON / integer | Preview only — the server's stored result is authoritative |
| `mark_notification_read(uuid)` | recipient | `boolean` | Authorizes via the same predicate as the RLS policy; idempotent |
| `mark_all_notifications_read(text)` | recipient | `integer` changed | Audience-scoped; truthful 0 on a second call |
| `unread_notification_count(text)` | recipient | `integer` | One round trip for the badge |
| `attach_catalogue_image(…)` | manager+ | `{image_id, bucket, path, is_primary}` | MIME allowlist, 5 MB cap, path prefix must be the caller's business |
| `set_primary_catalogue_image` / `detach_catalogue_image` / `set_catalogue_image_alt` | manager+ | — / coordinates / boolean | Detach promotes a survivor |
| `update_business_profile(…)` | **owner only** | `{business_id}` | Validates name/email/GSTIN; audits before-and-after |
| `upsert_store(…)` | **owner only** | `{store_id, created}` | Closing is `is_active=false`, never a delete |
| `set_notification_preferences(uuid, text[])` | any member | `{business_id, muted}` | Refuses `security` and unknown categories |

`create_sale` gained `loyalty_rule_version_id` / `loyalty_rule_version` in its
response. Everything else about its contract is unchanged.

### Server actions (typed failure unions, friendly messages, denial auditing)

`src/lib/qr/qr-actions.ts` · `src/app/business/(app)/settings/loyalty-rule-actions.ts` ·
`src/app/business/(app)/products/image-actions.ts`

The image action is the only one that does work the database cannot: it
**sniffs magic bytes** and refuses when they disagree with the declared
`Content-Type`, builds the object path itself, and deletes the uploaded object
if the metadata RPC refuses.

### HTTP endpoints

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Liveness. Touches nothing. |
| `GET /api/ready` | Readiness. Cheap PostgREST ping; demo mode is **ready** by design; reasons go to logs, not the body. |

---

## 5. Exact test results

All re-run on `c041f9d` immediately before writing this.

| Suite | Command | Result |
| --- | --- | --- |
| TypeScript | `npm run typecheck` | **PASS**, 0 errors |
| ESLint | `npm run lint` | **0 errors**, 55 warnings (pre-existing `react-hooks` advisories) |
| Unit tests | `npm test` | **35/35** |
| RLS policy harness | `npm run test:rls` | **109/109** |
| pgTAP suite | `npm run test:pgtap` | **306/306** |
| Schema validation | `node scripts/ci/validate-migrations.mjs` | **PASS** — 12 migrations, 30 tables, 65 definer functions |
| Secret scan | `npm run scan:secrets` | **PASS** — 10 rules, no findings |
| Production build | `npm run build` | **PASS** |
| Route smoke | `npm run smoke` | **39/39** |
| UI acceptance gate | `npm run test:ui` | **25/25** (desktop light + dark, mobile) |
| Accessibility audit | `npm run audit:a11y` | **0 serious/critical** across all five critical flows |
| Health endpoints | manual `curl` | `/api/health` 200 · `/api/ready` 200 `mode:demo` |

Test-case growth in this engagement: RLS harness 78 → **109**, pgTAP 155 → **306**,
unit 8 → **35**, plus 25 browser tests and the generated a11y report.

Per-slice evidence with full logs is in `RLS_TEST_RESULTS.md` (Runs 6–10).

### Bugs the tests caught in my own work

Worth recording, because each would have reached a user:

1. `attach_catalogue_image` violated its own unique index on the **second**
   upload for a product — invisible to any happy-path check.
2. `upsert_store` referenced a column (`address`) that does not exist.
3. `verify_membership_qr_token` originally raised on failure, silently
   discarding the security trail **and** the rate limiter that reads it.
4. The rule engine was not self-installing: a tenant created after migration
   time had no rule and every sale failed closed.
5. `businesses.UPDATE` / `stores.INSERT/UPDATE` were still granted after the
   settings RPCs took over — a way to change tenant configuration with no audit
   entry. Found by the CI validator, not by reading the code.
6. Two of my own RLS assertions were **flaky** (loose `select … into` with
   multiple candidate rows). Fixed and verified stable over repeated runs.

---

## 6. Accessibility — what changed and what you must accept

The audit was run, not asserted. First run: **8 serious/critical violations**;
now **0**. The fixes changed real design tokens:

| Token | Before | After | Why |
| --- | --- | --- | --- |
| `--primary` | `218 92% 55%` | `218 92% 46%` | Brand text was 4.33:1 on white — below AA |
| `--success` | `152 62% 36%` | `152 62% 30%` | "+12 pts" figures were 3.79:1 |
| `--warning` | `38 92% 50%` | `38 92% 30%` | Amber text was **2.13:1** — effectively unreadable |
| Tier badge shades | amber-600/700 etc. | two steps darker | 2.93:1 on its own tint |

**⚠️ Owner decision required:** primary and amber are now visibly darker. Hue
and saturation are unchanged so the brand still reads the same, but if you
prefer the original palette you must consciously accept the contrast failures.
Say so and I will revert the tokens and record the exception.

Also fixed: `Progress` and `Slider` had no accessible names, and the login role
switcher was a tablist with **no tab panels** — `aria-controls` pointed at
nothing. It is now a radiogroup, which is what it always was.

---

## 7. Owner setup tasks

Nothing below can be done from the repository. Full detail in
`OWNER_ACTION_CHECKLIST.md` and `SETUP_SUPABASE_AND_RESEND.md`.

### Blocking — the app stays in demo mode until these are done

1. Create **two** Supabase projects: staging and production.
2. Put production on a plan **with backups**. Free has none, and this system
   holds money-adjacent balances.
3. Enable point-in-time recovery on production; retention ≥ 7 days.
4. Set environment variables in the hosting platform. The service-role key is
   server-side only and must never carry a `NEXT_PUBLIC_` prefix.
5. Configure Auth Site URL and redirect URLs for the real domain.
6. Verify the sending domain with Resend (SPF/DKIM) for invitations and resets.
7. Apply migrations: `supabase db push` to staging, then production
   (see `OPERATIONS.md` §7).
8. **Verify the Storage bucket policies on staging.** They cannot be exercised
   locally — the bare PostgreSQL used by the harness has no `storage` schema.
   Attempt an upload under another tenant's path prefix and confirm it fails.

### Strongly recommended

9. Enable GitHub **secret scanning and push protection**. Our scanner is a
   floor; it only sees what already reached the repository.
10. Choose an error-tracking vendor and wire the single call in
    `emit()` (`src/lib/observability/logger.ts`) — design and constraints in
    `OPERATIONS.md` §3.
11. Rehearse a restore once before launch. An untested backup is a rumour.
12. Run `RELEASE_CHECKLISTS.md` §A end to end on staging, including the manual
    keyboard and screen-reader passes that axe cannot perform.

### First CI run

The workflow has been written but **has never executed on GitHub** — I cannot
trigger Actions from here. The two things most likely to need adjustment on the
first run are the pinned `supabase/postgres` image tag and
`actions/dependency-review-action`. Expect one shakedown commit.

---

## 8. Deferred — explicitly not built

Per your standing instruction, none of this was started.

**Deferred by your direction:** SMS/WhatsApp/DLT · web push · external billing
and GST e-invoice integration · complex points-plus-cash and payment gateways ·
fractional units, variant matrix, brand hierarchy · tier-gated rewards and
advanced manager scopes · campaign/challenge/referral server migration and
advanced analytics · multi-business selector · points-expiry cron.

**Deferred by design during the work** (each documented where it lives):

| Area | Deferred | Reason |
| --- | --- | --- |
| QR | Camera decoding | Your constraint; capture is simulated, manual lookup is the fallback |
| QR | Consumed-token sweeper | Rows are small, indexed and useful evidence; retention belongs with the backup policy |
| Loyalty | Per-store / per-category rule series | Tables are already keyed for it |
| Loyalty | Tier multipliers, category and campaign bonuses | Shown in the UI as explicitly future, not half-working |
| Loyalty | Rule simulation against past sales | Nice-to-have |
| Notifications | Digesting/grouping, retention sweeper | Volume does not warrant it yet |
| Notifications | A live `/customer/notifications` page | The bell is the MVP surface; the page still shows prototype data |
| Storage | Image cropping/resizing | `width`/`height` columns exist for when it lands |
| Catalogue | Customer-facing product catalogue | Product images stay staff-side |
| Settings | Tier configuration, campaign settings, per-store notification routing | §6 says build only the essential five |

### One known, non-exploitable hardening item

PostgreSQL grants `EXECUTE` to `PUBLIC` by default, so trigger functions
(`notify_on_*`, `lrv_*`, `*_no_mutation`, `install_default_loyalty_rule`, …)
are technically callable by `authenticated`. Calling one directly raises
`trigger functions can only be called as triggers`, so there is no exploit —
but it is inconsistent with the revoke discipline applied elsewhere, and the CI
validator does not currently check it. I have **not** fixed it, because doing so
at handoff would be expanding scope after you asked me to stop. It is a
one-line migration plus a validator rule whenever you want it.

---

## 9. Where to look

| Question | Document |
| --- | --- |
| How do I run it / what are the conventions? | `README.md` |
| How do I operate it? | `OPERATIONS.md` |
| How do I ship it? | `RELEASE_CHECKLISTS.md` |
| Who can see what, and why? | `RLS_POLICIES.md` |
| What is the evidence? | `RLS_TEST_RESULTS.md` (Runs 1–10) |
| How accessible is it right now? | `PERFORMANCE_A11Y_AUDIT.md` (regenerate with `npm run audit:a11y`) |
| What must the owner do? | `OWNER_ACTION_CHECKLIST.md`, and §7 above |

---

## 10. Recommended next step

Run `RELEASE_CHECKLISTS.md` §A against a real staging project. Everything in
this repository has been verified as far as a sandbox honestly allows: the
database contract is proven against a real PostgreSQL, the UI gate runs in a
real browser, and the accessibility audit is a measurement rather than a claim.
What cannot be proven here — Realtime sockets, Storage policies, email delivery,
and the behaviour of a real phone on shop Wi-Fi — is exactly what staging is
for, and each of those has a specific checklist item waiting.
