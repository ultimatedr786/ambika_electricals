# REWARDLY / AMBIKA ELECTRICALS
# PHASE 2 — STEP 2: PLATFORM UPGRADE, REAL AUTHENTICATION & SECURITY FOUNDATION

## 1. Purpose and boundary

Phase 1, 1.1, 1.2 and 1.3 are complete. This phase begins the production backend carefully, beginning with the identity and security foundation.

This phase must deliver:

- A supported, security-patched Next.js foundation.
- Supabase project integration that is safe for local, staging and production use.
- Real authentication: email/password, email confirmation, password reset and email OTP.
- Roles, profile creation, staff invitations and protected routes.
- Secure tenant/business/store membership model backed by Row Level Security.
- Clear setup instructions for the business owner to configure Supabase and Resend.

This phase must **not** yet replace mock sales, inventory, loyalty points, reward redemption, QR scanning, campaign, challenge or referral services. Those are later Phase 2 vertical slices.

Preserve the working Phase 1 interface, routes, PWA behavior, visual design, local demo mode and all completed journeys. Existing mock demo access remains available but must be visibly labelled as Demo mode and must never bypass production authorization in real routes.

---

## 2. Approved decisions

### 2.1 Application framework

Upgrade Next.js 14.2.35 to the current supported Next.js 16 security/LTS release before real authentication goes live. Perform a compatibility audit first and fix all upgrade changes deliberately. Upgrade compatible React, React DOM, TypeScript and tooling dependencies only as required by Next.js 16.

Do not blindly replace configuration or working route behavior. Verify all existing routes after the upgrade.

### 2.2 Database and backend platform

Use Supabase:

- PostgreSQL database
- Supabase Auth
- Row Level Security (RLS)
- Supabase Realtime
- Supabase Storage
- SQL migrations managed through Supabase tooling

Do not add Prisma in this phase. Supabase SQL migrations and RLS policies are the single database source of truth. Do not introduce a second ORM/migration system.

### 2.3 Authentication approach

Production authentication supports:

- Email + password
- Email confirmation
- Password reset
- Email OTP/passwordless sign-in
- Owner/staff invitations by email

Do **not** implement phone/SMS OTP in this phase.

Supabase Auth must own identity, OTP validation, session lifecycle, rate limits and password-reset security. Resend is only the mail delivery provider, configured through Supabase custom SMTP or an approved Supabase Auth email hook. Never generate or validate authentication OTPs directly in the browser or through a standalone Resend API call.

### 2.4 Email delivery

Use Resend for production auth email delivery. The owner will later provide a verified sending domain, SMTP/API credentials and preferred From address. Recommended structure:

- Auth sending domain: auth.yourdomain.com
- Sender: no-reply@auth.yourdomain.com
- Marketing/transactional campaigns: separate sender/domain later

Configure SPF, DKIM and DMARC before production launch. Do not commit secrets, API keys, SMTP passwords or service-role keys.

### 2.5 Loyalty policy at launch

- ₹100 eligible spend earns 10 points.
- One point has ₹0.10 reward value.
- No points expiry at launch.
- Delete/replace prototype hard-coded expiry copy/data.
- Future rule changes must be versioned; historical earn/redemption records will retain the rule that created them.

### 2.6 Billing boundary

Rewardly is **not** the GST invoice of record. Existing billing/POS software remains authoritative for invoicing and tax compliance. Rewardly will later retain only the verified sale details needed for loyalty activity and rewards.

---

## 3. Delivery sequence

Complete work in this exact order. Commit each coherent stage separately and keep the application runnable throughout.

### Stage A — Preflight and Next.js 16 upgrade

1. Inspect package.json, Node version, TypeScript, ESLint, Tailwind, Radix/shadcn, Three.js/R3F, PWA wiring and Next configuration.
2. Record the upgrade plan and compatibility risks.
3. Confirm the project meets Next.js 16 runtime requirements before changing dependencies.
4. Upgrade Next.js and required peer dependencies.
5. Update breaking framework changes carefully, including routing, metadata, proxy/middleware conventions, image configuration, async APIs and lint/build command changes where applicable.
6. Run type checks, lint, production build and route smoke checks.
7. Verify Phase 1 customer flow, business sale flow, PWA manifest/offline screen, auth demo screens, dialogs/sheets and responsive navigation have not regressed.

Do not begin Supabase authorization work until this upgrade is clean.

### Stage B — Supabase project structure and environment safety

1. Add Supabase CLI/project structure and migration convention.
2. Add a complete .env.example containing placeholder variable names only:
   - NEXT_PUBLIC_SUPABASE_URL
   - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
   - SUPABASE_SERVICE_ROLE_KEY (server-only; document only)
   - any server-only Resend or application settings required later
3. Ensure .env.local and all real secret files are ignored by Git.
4. Build separate browser, server and admin Supabase client helpers. The browser client may use only the public/publishable key; service role access must be impossible from client bundles.
5. Set up local/development, staging and production configuration conventions.
6. Create a human-readable SETUP_SUPABASE_AND_RESEND.md with dashboard steps, required variables, redirect URLs, email templates, DNS requirements and verification checklist.

The agent may create template files and documentation. It must never invent, request in chat output, print, commit or expose real credentials.

### Stage C — Core security schema and migrations

Create versioned SQL migrations, not ad-hoc dashboard-only tables.

#### Required initial tables

- profiles: one profile per auth user; fields include id (auth user id), display name, email, avatar metadata, status, created/updated timestamps.
- businesses: business identity and lifecycle status.
- stores: store belongs to business; includes display/location/contact metadata and active status.
- business_memberships: profile-to-business relationship with role.
- store_memberships: profile-to-store assignment/permission scope for staff.
- customer_memberships: customer profile linked to a business, membership ID, membership status, enrollment data and non-sensitive display data.
- invitation records: business/store target, invited email, role, secure token hash, expiry, status, inviter, accepted timestamp.
- audit_logs: immutable initial security/event audit trail for invitations, role changes and access-sensitive actions.

#### Schema rules

- Use UUID primary keys where appropriate; link auth users to profiles by auth.users ID.
- Add created_at and updated_at timestamps; include actor/audit metadata for sensitive objects.
- Add foreign keys, check constraints, unique constraints and indexes deliberately.
- Membership IDs must be unique within a business, not globally predictable.
- Use a role enum or constrained role model: customer, owner, manager, staff, super_admin.
- Seed development-only Ambika Electricals business, stores, Rahul customer, business owner and staff profiles without creating production credentials.
- Do not create sales, product, points-ledger or redemption tables in this step unless required only as a future migration placeholder; their transactional design needs its own approved vertical slice.

### Stage D — Row Level Security

Enable RLS on every application table from Stage C. No business/customer table is public by default.

#### Required authorization principles

- A user may read/update their own profile within safe fields only.
- Customer may read only their own customer membership and only their own future loyalty records.
- Owner may manage their own business, stores, staff and customer memberships.
- Manager may receive scoped management permissions, never owner-only controls unless explicitly granted.
- Staff may access only assigned store/business customer lookup and operational data; never business settings, billing, or unrestricted staff management.
- A business user cannot access another business’s data, even if they manipulate browser identifiers.
- Store-scoped staff cannot access unassigned store data.
- Invitation creation/acceptance, role changes and staff removal must use server-authorized operations with audit events.
- Service role is reserved for trusted server operations and scripts, never browser code.

Write policies that are fail-closed. Add SQL policy tests or integration tests proving allowed and denied cases for every role/tenant boundary.

### Stage E — Server/client auth integration

Use the recommended secure Supabase SSR/cookie integration for the installed versions.

1. Create browser client, server client and session refresh/proxy handling.
2. Establish a trusted server-side current-user and authorization helper.
3. Add protected route groups for customer and business areas.
4. Route a signed-in customer to their customer experience; route owner/manager/staff to their permitted business/store experience.
5. Preserve return-to destination safely after sign-in; validate redirects to avoid open redirect attacks.
6. Ensure navigation prefetch/session-refresh behavior does not cause stale auth state or redirect loops.
7. Replace demo auth only at clear production boundaries. Keep a separate development/demo mechanism that cannot be enabled by production users.

### Stage F — Authentication flows

#### Email/password

- Sign up with server/client validation, secure confirmation email, and profile bootstrap.
- Sign in, sign out, remember-session behavior, invalid credential feedback and protected-route redirect.
- Password reset request, safe reset screen, password-strength validation and session recovery.
- Avoid account enumeration: reset/sign-in messages must not reveal whether an email exists unnecessarily.

#### Email OTP

- User requests an email OTP/passwordless sign-in.
- Supabase Auth sends and verifies the OTP.
- Add resend cooldown UI, rate-limit-friendly messaging and expired-code recovery.
- Verify redirect URLs and session exchange safely for SSR.
- Email copy must use Ambika Electricals/Rewardly branding and include support/help text.

#### Invitations

- Owner can invite manager/staff using server-authorized action.
- Invitation email has expiry and single-use acceptance handling.
- Accepting invitation attaches the authenticated profile to only the intended business/store/role.
- Expired/revoked/used invitation behavior is explicit and audited.

### Stage G — Resend and email configuration documentation

Create production-ready but secret-free documents/templates:

- Custom SMTP setup in Supabase using Resend.
- Required Resend verified-domain/DNS records.
- Auth templates: confirmation, magic-link/OTP, password reset, invitation.
- Required auth redirect URLs for localhost, staging and production.
- Rate-limit expectations and resend/cooldown UX.
- Test checklist using a non-owner test email.

Do not send real emails automatically until the owner configures the Supabase project, Resend account and verified domain.

---

## 4. UX requirements

- Retain the premium existing Login, Signup, Forgot Password and business/customer role-selection UI.
- Demo mode remains clearly marked, isolated and appropriate only for development/preview.
- Real auth flow must feel quick: short button feedback, no arbitrary sleep delays, contextual loading states, no blank screen.
- Email OTP entry supports paste, keyboard navigation, clear validation and resend cooldown.
- Authentication errors must be useful but not leak sensitive security details.
- Account/session state should update UI quickly. Avoid full-page refresh unless security/session flow requires it.
- Ensure loading/error/success and offline states work with the existing PWA foundation.
- Preserve accessibility: labels, focus movement, error announcements, visible focus indicators and sufficient contrast.

---

## 5. Testing and verification

### Automated checks

- TypeScript, lint, production build and route smoke test.
- Migration apply/rollback check in local development environment.
- Schema constraints/indexes verification.
- RLS policy tests for every required allow/deny rule.
- Auth flow tests: signup, confirmation, sign-in, sign-out, password reset, email OTP, invite accept, expired invite, revoked invite.
- Protected-route tests for unauthenticated, customer, staff, manager and owner users.
- Secret-scanning and dependency/security checks in CI.

### Manual checks

- Customer signup/sign-in at mobile and desktop.
- Owner invites staff; staff accepts and sees only permitted store/business experience.
- Customer cannot reach business routes by changing URL.
- Staff cannot reach owner settings by changing URL.
- A user in one business cannot read another business’s data.
- Resend/auth emails render branded and work from verified test domain once configured.
- Demo mode is unavailable to production users.
- Existing mock sale/reward/points flows still work exactly as before.

---

## 6. Required deliverables before stopping

Do not begin sales, inventory, points ledger, reward redemption, production QR, real-time multi-device sync, web push or product image storage migration until this checklist is complete.

Deliver:

1. NEXT_16_UPGRADE_REPORT.md: dependencies changed, compatibility fixes, verification results and known risks.
2. SETUP_SUPABASE_AND_RESEND.md: exact owner dashboard/DNS/environment setup steps, without secrets.
3. .env.example: placeholders only.
4. Supabase SQL migrations and seed instructions.
5. RLS policy documentation plus test coverage/results.
6. Real auth/role/invitation implementation report listing changed files and tested flows.
7. Clear list of credentials, business decisions or external actions the owner must perform.
8. A phase handoff report explaining what is ready for the next vertical slice: server-authoritative sales, inventory and immutable points ledger.

## 7. Definition of done

Step 2 is complete only when:

- Next.js runs on a supported upgraded release and existing flows pass checks.
- Supabase environment structure is safe; no secret is in Git/client bundle/logs.
- Real email/password, confirmation, password reset and Email OTP authentication work once environment values are configured.
- Profiles, businesses, stores, memberships, invitations and audit logs use migrations, constraints and RLS.
- Access is proven isolated by role, business and store.
- The production auth UI remains polished, fast, responsive and accessible.
- Resend/Supabase custom SMTP setup is fully documented and ready for the owner’s domain configuration.
- Sales, inventory, points, rewards and redemptions remain mock-only and working.
- Agent stops for approval before the next Phase 2 slice.
