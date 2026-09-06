# Release checklists — staging/UAT and production

Two checklists. The first is run once per release candidate on staging; the
second is run at the moment of going live. Both are written so a second person
can execute them without asking questions.

Companion documents: `OPERATIONS.md` (how things work), `OWNER_ACTION_CHECKLIST.md`
(external setup), `PERFORMANCE_A11Y_AUDIT.md` (generated audit).

---

## A. Staging / UAT checklist

### A1. Before you start

- [ ] Staging Supabase project exists and is **separate** from production.
- [ ] Staging environment variables set (URL, publishable key, service-role key,
      Resend key if email is being tested). No production values anywhere.
- [ ] Every CI job green on the commit under test.
- [ ] `supabase db push` applied cleanly to staging, and `supabase test db`
      passes against it (real pgTAP, not the local stub runner).
- [ ] A manual backup snapshot exists, so UAT can be repeated from a known state.

### A2. Authentication and access

- [ ] Owner can sign up, create the business and land on the business dashboard.
- [ ] Owner invites a manager and a cashier; both accept and land in the right place.
- [ ] A cashier assigned to one store sees **only** that store in the POS store picker.
- [ ] A customer signs up, links to the business, and sees only their own data.
- [ ] Signing out clears the session; a protected URL redirects to login and
      returns to the intended page afterwards.
- [ ] **Cross-tenant probe:** with a second business, confirm no customer,
      sale, reward, notification or image from business A is visible to B.

### A3. Point of sale and loyalty

- [ ] Record a member sale. Invoice number, total and points on the receipt match
      the database (`sales`, `points_ledger`).
- [ ] The points awarded equal the **current rule version**, and
      `sales.loyalty_rule_version_id` is populated.
- [ ] Record a walk-in sale — no points, no ledger row.
- [ ] Submit the same sale twice (double-click Record): exactly one sale exists.
- [ ] Void a sale as a manager: points reverse, stock returns, status is `voided`,
      the sale is not deleted.
- [ ] A cashier cannot void.

### A4. Loyalty rule engine

- [ ] Owner changes the earning rate. A **new version** appears; the previous one
      is marked superseded and keeps its original numbers.
- [ ] A sale recorded before the change still shows its original points.
- [ ] A sale recorded after the change uses the new rate.
- [ ] Schedule a rule for a future date: today's sales still use the current rate.
- [ ] A manager cannot change the rule (the control is visibly disabled and the
      server refuses if forced).
- [ ] Invalid input (₹0 step, 5000 points, a past start date) is refused with a
      readable message.

### A5. Membership QR

- [ ] Customer opens their code: a **scannable** QR appears with a countdown.
- [ ] Scanning it at the counter identifies the right member and shows the balance.
- [ ] Scanning the **same** code again is refused as already used.
- [ ] Waiting past expiry then scanning is refused as expired.
- [ ] "Hide my QR" makes the displayed code stop working immediately.
- [ ] A cashier from another store/business cannot verify the code.
- [ ] Manual lookup finds the member when the customer's phone is flat, and the
      sale records that no QR was presented.
- [ ] `qr_verification_attempts` shows every attempt; a manager can see it and a
      cashier cannot.

### A6. Rewards and redemption

- [ ] Customer redeems a reward: points are deducted, a reference and a one-time
      code are issued.
- [ ] Staff collect the redemption with the code; stock decrements.
- [ ] The same code cannot be collected twice.
- [ ] A wrong code is refused.
- [ ] Cancelling refunds the points and frees the hold.
- [ ] A customer with insufficient points is refused and nothing is written.

### A7. Notifications and realtime

- [ ] A sale in one browser produces a customer notification in another **without
      a refresh**.
- [ ] Unread badge is correct; marking read persists across a reload and to a
      second device.
- [ ] Mark-all clears the business bell without touching the customer bell.
- [ ] Kill the network for 30 seconds: the bell shows "Reconnecting…", then
      recovers **without duplicating** anything.
- [ ] Muting a category in settings hides it from the list and the badge, for
      that user only.
- [ ] A blocked QR scan produces a security notification a manager can see —
      and confirm the security category **cannot** be muted.

### A8. Images and settings

- [ ] Upload a product image as a manager; the thumbnail appears.
- [ ] Upload a second and make it primary; exactly one thumbnail remains.
- [ ] Try a `.svg`, a 10 MB file, and a `.png` that is really a text file —
      all three are refused with a clear message.
- [ ] Delete an image: it disappears from the UI and from Storage.
- [ ] A cashier cannot upload or delete.
- [ ] Owner edits the business name/GSTIN; an invalid GSTIN is refused.
- [ ] Owner adds a store and closes one; the closed store leaves the POS picker
      but its history remains.

### A9. Mobile and PWA

Run on a **real phone**, not just a resized desktop window.

- [ ] Install prompt appears, and stays dismissed through navigation and a refresh.
- [ ] Installed app opens standalone; bottom navigation and drawer work.
- [ ] The QR code is legible and scannable from the installed app.
- [ ] Offline page appears with the network off, and recovers when it returns.
- [ ] No horizontal scrolling on a 360px-wide screen.
- [ ] Tap targets on the POS are usable one-handed.

### A10. Accessibility and performance

- [ ] `npm run audit:a11y` against staging reports **0 serious/critical**.
- [ ] Keyboard-only pass of login → Create Sale → complete sale: every control is
      reachable, focus is always visible, no keyboard trap.
- [ ] Screen-reader pass (VoiceOver or TalkBack) of the customer QR and the
      redemption flow: names and states are announced meaningfully.
- [ ] The critical flows feel responsive on a mid-range Android over 4G.
- [ ] Both light and dark themes checked — the audit script covers light only.

### A11. Sign-off

- [ ] Owner has personally completed one full counter cycle: enrol → sale →
      points → redeem → collect.
- [ ] Every deviation found is either fixed or written down as accepted.
- [ ] Owner records explicit approval to proceed to production.

---

## B. Production deployment checklist

### B1. Pre-flight (the day before)

- [ ] UAT signed off on the exact commit being deployed.
- [ ] Production Supabase project on a plan **with backups** (Free has none).
- [ ] PITR enabled; retention ≥ 7 days.
- [ ] Production environment variables set in the hosting platform; service-role
      key server-side only.
- [ ] Auth redirect URLs and Site URL point at the production domain.
- [ ] Email sending verified from the production domain (SPF/DKIM).
- [ ] Storage buckets `product-images` and `reward-images` exist with the
      migration's policies — **verify by attempting a cross-tenant upload path**,
      which the local test harness cannot exercise.
- [ ] Rollback decision-maker named, and reachable during the window.

### B2. Deploy

- [ ] Announce a short maintenance window (counter staff should know).
- [ ] **Take a manual backup snapshot now.** Record its identifier here: ______
- [ ] `supabase link --project-ref <production-ref>`
- [ ] `supabase db diff --linked` — review what is about to change.
- [ ] `supabase db push` — apply migrations **before** the app deploy.
- [ ] Deploy the application build.
- [ ] Confirm the deployed commit SHA matches the approved one.

### B3. Immediately after (first 15 minutes)

- [ ] `GET /api/health` → 200.
- [ ] `GET /api/ready` → 200 with `"mode":"live"`.
- [ ] Owner signs in on production.
- [ ] Record one real ₹1 sale to a test membership: invoice, points and ledger
      all correct. Void it afterwards.
- [ ] Show and scan one QR end to end.
- [ ] Notification arrives without a refresh.
- [ ] Error stream is quiet; no `service_role` or token value appears anywhere
      in the logs.

### B4. First 24 hours

- [ ] Watch error rate and `/api/ready` at least twice.
- [ ] Confirm the first automated backup ran.
- [ ] Check `audit_logs` looks sane for the day's activity.
- [ ] Ask counter staff what was confusing — the first day is the only time you
      get that feedback honestly.

### B5. Rollback trigger and procedure

Roll back if **any** of these is true:

- Sales cannot be recorded, or record incorrect totals/points.
- Customers can see data belonging to another customer or another business.
- Sign-in is broken for more than 10 minutes.
- Error rate is materially above the staging baseline and rising.

Procedure (see `OPERATIONS.md` §4 for the reasoning):

1. **Roll back the application deployment**, not the database. Every migration
   in this release is additive or permission-tightening, so the previous build
   runs against the new schema.
2. Verify `/api/ready` and one sale on the restored build.
3. Only if data is actually corrupted: PITR restore to just before the window,
   then replay missing sales (`create_sale` is idempotent).
4. Write down what happened before fixing it. The postmortem is worth more than
   the fix.
