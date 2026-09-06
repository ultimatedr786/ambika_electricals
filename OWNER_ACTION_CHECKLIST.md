# OWNER ACTION CHECKLIST

Phase 2 Step 2 · deliverable 7 of 8 · everything the owner must do, decide, or
provide. Nothing here is done by the agent — these are accounts, credentials,
DNS and business decisions only you control.

**Golden rule:** never paste any key, password or API token into chat, email,
or Git. Enter them only in the dashboards/`.env.local` described below.

---

## A. Accounts to create (≈30 min)

| # | Action | Where | Output you must keep |
| --- | --- | --- | --- |
| A1 | Create a Supabase account + two projects: `rewardly-staging`, `rewardly-production` | supabase.com | Project refs (URL ids) |
| A2 | Create a Resend account | resend.com | Login only — keys in C |
| A3 | Decide the app domains | your DNS provider | e.g. app on `yourdomain.com`, staging on `staging.yourdomain.com` |
| A4 | Decide the sending subdomain | — | Recommended: `auth.yourdomain.com` (auth mails), separate sender later for marketing |

## B. Business decisions required

| # | Decision | Default implemented | To change |
| --- | --- | --- | --- |
| B1 | Launch loyalty policy | ₹100 → 10 points; 1 point = ₹0.10; **points never expire** | Business → Settings (mock UI now; real config slice later) |
| B2 | Who counts as Manager vs Staff | Manager: sales/customers/rewards/campaigns/analytics. Staff: record sales, scan QR, view customers. Settings + Staff management are **owner-only** | Tell the agent before the next slice; RLS + nav follow |
| B3 | Invitation lifetime | UI offers 24h / 72h (default) / 7 days; hard range 1h–30 days | Invite dialog on Staff page |
| B4 | Support contact shown in emails | care@ambikaelectricals.in · +91 98250 41200 · Shop 14, Sardar Complex, Ring Road, Surat | `supabase/templates/*.html` + `src/lib/auth/invite-mailer.ts` |
| B5 | Email sender name | "Ambika Electricals Rewards" / "Powered by Rewardly" | Same files |
| B6 | Demo mode in staging? | Off in production; optional in dev via `NEXT_PUBLIC_DEMO_AUTH=true` | Env var |
| B7 | DMARC policy | Start `p=none` with reports, tighten to `p=quarantine` after 2–4 clean weeks | DNS |

## C. Credentials to generate & store (never share)

| # | Credential | Where to get it | Where to put it |
| --- | --- | --- | --- |
| C1 | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API | Deployment env + `.env.local` (browser-safe) |
| C2 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`; legacy: anon key) | Same page | Same places (browser-safe) |
| C3 | `SUPABASE_SERVICE_ROLE_KEY` (`sb_secret_…`; legacy: service_role) | Same page | **Server env only** — never NEXT_PUBLIC, never Git |
| C4 | Resend API key (`re_…`) | Resend → API Keys | `RESEND_SMTP_PASSWORD` (server env) + Supabase SMTP password field |
| C5 | Verified sender | Resend → Domains (after D) | `AUTH_EMAIL_FROM=no-reply@auth.yourdomain.com` |

Store C1–C5 in: your hosting platform's environment settings (staging and
production separately) and `.env.local` for local dev. `.env*` files are
git-ignored; `.env.example` documents the names.

## D. DNS records (at your domain registrar)

| # | Record | Purpose |
| --- | --- | --- |
| D1 | Resend SPF/MX record for `auth.yourdomain.com` | Authorizes Resend to send as you (exact values shown by Resend → Domains) |
| D2 | Resend DKIM records (×3) | Signing keys, Resend-managed rotation |
| D3 | `_dmarc.yourdomain.com TXT "v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com"` | Deliverability monitoring (see B7) |
| D4 | Wait for Resend to show all records **Verified** | Before enabling SMTP |

## E. Supabase dashboard configuration (per project)

Full click-path in `SETUP_SUPABASE_AND_RESEND.md`; summary:

| # | Action |
| --- | --- |
| E1 | `npx supabase link --project-ref <REF>` then `npx supabase db push` (staging first) |
| E2 | Auth → Emails → SMTP: enable custom SMTP → `smtp.resend.com:465`, user `resend`, password = C4, sender = C5 |
| E3 | Auth → Emails → Message templates: paste the four files from `supabase/templates/` |
| E4 | Auth → Providers: Email ON (confirmation ON, Email OTP ON); phone/SMS OFF |
| E5 | Auth → Settings: password min 8 + upper/lower/digit/symbol; secure password change ON; mailer frequency 60s |
| E6 | Auth → URL Configuration: Site URL + Redirect URLs exactly as listed in SETUP §5 (all point at `/auth/confirm`) |
| E7 | Review Auth → Rate Limits defaults; adjust only if launch traffic demands |

## F. Verification before launch (staging)

Run the 10-point test checklist in `SETUP_SUPABASE_AND_RESEND.md` §7 with
**non-owner test emails** (`you+test1@…`): signup/confirmation, OTP, reset,
protected-route redirects, invitation accept/expire/revoke, tenant isolation,
demo-mode absence, PWA.

Also on a Docker machine:

```bash
npx supabase test db        # pgTAP suite (48 assertions)
npx supabase db reset       # local stack: migrations + dev seed (never against cloud)
```

## G. Security habits (ongoing)

1. Rotate `SUPABASE_SERVICE_ROLE_KEY` immediately if ever exposed (dashboard →
   API → rotate; then update envs and restart).
2. Review Dashboard → Authentication → Logs weekly during launch month.
3. Owners: review the in-app audit trail (Staff page actions, invitations) —
   every create/revoke/accept/role change/remove is recorded with IP.
4. Keep schema changes in `supabase/migrations/` only; every new table gets
   RLS + tests in the same commit.
5. Never commit `.env*`; never enable `NEXT_PUBLIC_DEMO_AUTH` publicly.
