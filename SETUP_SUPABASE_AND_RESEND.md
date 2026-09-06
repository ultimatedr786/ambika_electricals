# SETUP GUIDE — Supabase + Resend (owner checklist)

Phase 2 Step 2 · Rewardly / Ambika Electricals

This guide takes you from an empty dashboard to working real authentication
(email + password, confirmation, password reset, email OTP, staff invitations).
**No secret may ever be pasted into chat, committed to Git, or prefixed with
`NEXT_PUBLIC_` unless stated below.** The repo ships `.env.example` with
placeholder names only.

---

## 0. What you will need

| Item | Where | Notes |
| --- | --- | --- |
| Supabase account | https://supabase.com | Free tier is fine to start |
| Resend account | https://resend.com | Needed for real email delivery |
| A domain you control | e.g. `ambikaelectricals.in` | Recommended sending subdomain: `auth.yourdomain.com` |
| Access to your DNS provider | Wherever the domain's DNS is hosted | For SPF/DKIM/DMARC records |
| Node.js ≥ 20.9 and Docker (local dev only) | https://nodejs.org · https://docker.com | Docker is required only for the local Supabase stack |

---

## 1. Create the Supabase projects (one per environment)

Create **two** cloud projects (plus the local stack for development):

1. `rewardly-staging` — for testing with real emails before launch.
2. `rewardly-production` — the live project.

Convention used everywhere in this repo:

| Environment | Supabase | App URL |
| --- | --- | --- |
| Local dev | `supabase start` CLI stack | `http://localhost:3000` |
| Staging | `rewardly-staging` project | `https://staging.yourdomain.com` |
| Production | `rewardly-production` project | `https://yourdomain.com` |

Each deployment gets its own `.env` values (never share keys between
staging and production).

---

## 2. Apply the database migrations

The database schema (profiles, businesses, stores, memberships, invitations,
audit logs, RLS) lives in `supabase/migrations/` and is the **single source of
truth** — do not hand-edit tables in the dashboard.

```bash
npm install                          # installs the supabase CLI as a dev dependency
npx supabase login                   # opens a browser login
npx supabase link --project-ref <PROJECT_REF>          # staging first
npx supabase db push                                   # applies the 3 migrations
```

`<PROJECT_REF>` is the subdomain id in your project URL
(`https://<PROJECT_REF>.supabase.co`).

### Local development

```bash
npx supabase start        # requires Docker; boots Postgres + Auth + mail catcher
npx supabase db reset     # applies migrations AND supabase/seed.sql (demo tenant)
```

- Local API: `http://127.0.0.1:54321`, keys printed by `supabase start`.
- Emails are **not** sent anywhere locally — open http://localhost:54324
  (Inbucket) to read confirmation/OTP/reset mails.
- `seed.sql` refuses to run on a database that already contains users, and its
  accounts use non-routable `@ambika.local` addresses with **invalid password
  hashes** (no credentials are created). Never run `db reset` against a linked
  staging/production project.

### Verifying RLS locally

```bash
npx supabase test db                      # pgTAP suite (48 assertions)
PGPORT=54329 node scripts/rls-check/run.mjs   # plain-SQL harness (42 cases), any PostgreSQL
```

---

## 3. Environment variables

Copy `.env.example` → `.env.local` (git-ignored) and fill in per environment.

| Variable | Where to find it | Exposure |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Dashboard → Project Settings → API → Project URL | Browser-safe |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Same page → **publishable** key (`sb_publishable_…`; legacy projects: `anon` public key) | Browser-safe |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → **secret** key (`sb_secret_…`; legacy: `service_role`) | **SERVER-ONLY.** Never `NEXT_PUBLIC_`, never in a browser bundle, never in Git |
| `NEXT_PUBLIC_SITE_URL` | Your deployed app URL (`http://localhost:3000` locally) | Browser-safe |
| `RESEND_SMTP_PASSWORD` | Resend → API Keys (value `re_…`) used as the SMTP password | **SERVER-ONLY** |
| `AUTH_EMAIL_FROM` | e.g. `no-reply@auth.yourdomain.com` (must be on your verified Resend domain) | Server-only |
| `NEXT_PUBLIC_DEMO_AUTH` | Leave empty in production | See §8 |

Behaviour notes:

- If the two `NEXT_PUBLIC_SUPABASE_*` values are **absent**, the app keeps
  running the Phase 1 mock experience in clearly-labelled Demo mode. Real auth
  switches on automatically once both are present.
- Rotating the secret key: Dashboard → API → rotate; then update the
  deployment env and restart. Rotating invalidates the old key immediately.

---

## 4. Resend — verified domain + SMTP

Resend is only the **mail delivery provider**. All auth emails (confirmation,
OTP, password reset) are sent **by Supabase Auth** through Resend's SMTP. The
app itself never generates or validates OTPs.

### 4.1 Verify the sending domain

1. Resend → Domains → **Add Domain** → enter `auth.yourdomain.com`
   (a dedicated auth subdomain keeps marketing reputation separate).
2. Resend shows the DNS records to add. Typical set:
   - **SPF / MX** — `send.` subdomain record authorizing Resend's mail servers.
   - **DKIM** — three `CNAME`/`TXT` signing keys (Resend-managed rotation).
   - **DMARC** — add on your root domain, e.g.
     `_dmarc.yourdomain.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"`
     during warm-up, then tighten to `p=quarantine`/`p=reject` after launch.
3. Wait for all records to show **Verified** in Resend (minutes to a few hours).

Sender to use: `Ambika Electricals Rewards <no-reply@auth.yourdomain.com>`.
Marketing/transactional campaigns later get their **own** sender/domain.

### 4.2 Point Supabase at Resend SMTP

For **local dev**: nothing to do — keep the built-in mail catcher (the SMTP
block in `supabase/config.toml` stays commented out on purpose).

For **staging & production** (Dashboard → Authentication → Emails →
**SMTP Settings** → Enable custom SMTP):

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` (SSL) — or `587` (STARTTLS) |
| Username | `resend` |
| Password | your Resend API key (`re_…`) — store it as the `RESEND_SMTP_PASSWORD` env value too |
| Sender email | `no-reply@auth.yourdomain.com` |
| Sender name | `Ambika Electricals Rewards` |

Send a test email from the same screen; it must arrive from your domain.

### 4.3 Email templates

Dashboard → Authentication → Emails → **Message templates**. Replace each
default with the matching branded file from this repo (they use the standard
GoTrue placeholders `{{ .ConfirmationURL }}`, `{{ .Token }}`, `{{ .Email }}`):

| Template | File |
| --- | --- |
| Confirm signup | `supabase/templates/confirmation.html` |
| Magic Link / email OTP | `supabase/templates/magic_link.html` |
| Reset password | `supabase/templates/recovery.html` |
| Invite user | `supabase/templates/invite.html` |

Staff-invitation emails created inside the app (owner invites manager/staff)
are sent by the server through the Resend API with the same branding — those
never touch GoTrue templates.

---

## 5. Supabase Auth settings (dashboard)

Authentication → Providers: **Email** enabled; disable phone/SMS providers
(this phase is email-only). Authentication → Settings:

| Setting | Value | Why |
| --- | --- | --- |
| Confirm email | **ON** | Required by decision 2.3 |
| Enable Email OTP (One-Time Password) | **ON** | 6-digit codes instead of only magic links |
| Minimum password length | `8` | Mirrors the UI strength meter |
| Password requirements | upper, lower, digit, symbol | Mirrors `supabase/config.toml` |
| Secure password change | **ON** | Requires a fresh session to change passwords |
| Mailer frequency limit | 60s | Matches the in-app resend cooldown |
| JWT expiry | 3600s (default) | Sessions auto-refresh via the proxy |

### Redirect URLs (open-redirect safe)

Dashboard → Authentication → URL Configuration:

- **Site URL**
  - staging: `https://staging.yourdomain.com`
  - production: `https://yourdomain.com`
- **Redirect URLs** (exact allow-list; all auth emails land on `/auth/confirm`,
  which validates a same-origin `next` path before forwarding):
  - `http://localhost:3000/auth/confirm`
  - `http://127.0.0.1:3000/auth/confirm`
  - `https://staging.yourdomain.com/auth/confirm`
  - `https://yourdomain.com/auth/confirm`

Local `supabase/config.toml` already contains the localhost entries.

---

## 6. Rate limits & resend UX expectations

Supabase Auth enforces rate limits server-side (per IP and per email). With
custom SMTP the defaults are roughly: a handful of auth emails per hour per
address and ~30 sign-in/OTP requests per 5 minutes per IP (Dashboard →
Authentication → Rate Limits shows current values; adjust there, not in code).

The app is built around this:

- Resend buttons carry a **60-second cooldown** with a visible countdown.
- “Too many requests” responses surface a calm retry-later message — never a
  stack trace, never whether the account exists.
- Sign-up confirmation and password-reset screens use **non-enumerating copy**
  (“If an account exists for …, an email is on its way”).

Resend free tier allows ~100 emails/day — enough for launch testing; upgrade
before marketing volume.

---

## 7. Test checklist (use a NON-owner test email)

Run on staging first, then repeat smoke checks on production. Use e.g.
`you+test1@gmail.com` style addresses so the owner account is never locked out.

1. **Sign up (customer)** — `/signup` → confirmation email arrives **from your
   verified domain** → enter the 6-digit code (or click the link) → lands on
   the customer dashboard.
2. **Sign in** — password flow works; wrong password shows a generic error.
3. **Email OTP** — `/login` → “Sign in with email OTP” → code arrives →
   paste/typing works → signed in. Resend button counts down 60s.
4. **Password reset** — `/forgot-password` → email arrives → `/reset-password`
   → new password accepted → old password rejected afterwards.
5. **Protected routes** — signed out: `/customer/dashboard` and
   `/business/dashboard` redirect to `/login?next=…`; after sign-in you land
   back at the original page.
6. **Invitation** — owner signs in → Staff page → invite `you+test2@…` as
   staff → email arrives with a single-use link → accepting while signed out
   routes through login/signup and back → invitee lands in the business area
   with **staff** visibility only (no Settings/Staff management).
7. **Expired/revoked invites** — revoke an invite in the UI → the accept page
   says “no longer valid”. Let one expire → accept page says “expired, ask the
   owner for a new one”.
8. **Tenant isolation** — with a second business (staging), confirm neither
   side can open the other's data by editing URLs/ids.
9. **Demo mode is gone** — on production, the demo quick-fill panel and demo
   switcher do not appear.
10. **PWA** — install prompt, offline screen, and manifest still work while
    signed in/out.

---

## 8. Demo mode rules (important)

- Demo (mock) auth is available **only while Supabase is not configured**, or
  in development builds with `NEXT_PUBLIC_DEMO_AUTH=true`.
- In production builds with Supabase configured, demo affordances are removed
  entirely and route protection is enforced server-side — demo mode can never
  bypass production authorization.
- Never set `NEXT_PUBLIC_DEMO_AUTH=true` on a public deployment.

---

## 9. Security ground rules

1. Secrets (`SUPABASE_SERVICE_ROLE_KEY`, `RESEND_SMTP_PASSWORD`) live only in
   the deployment platform's env store and `.env.local` — both git-ignored.
2. The service-role key is imported exclusively through
   `src/lib/supabase/admin.ts`, which imports `server-only` — a browser import
   fails the build.
3. Rotate the service-role key immediately if it is ever exposed.
4. Review Dashboard → Authentication → Logs and the `audit_logs` table
   (owners see their business trail in-app) after launch week.
5. Keep `supabase/migrations/` as the only way to change the schema; every
   migration that touches tables must keep RLS enabled and add tests.
