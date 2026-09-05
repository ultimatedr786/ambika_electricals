# REWARDLY / AMBIKA ELECTRICALS
# PHASE 1.2 — PREMIUM AUTH VISUALS, PERFORMANCE, LIVE UI & PWA FOUNDATION

## Agent instruction

Read PROJECT_BRIEF.md fully before coding. Phase 1 and Phase 1.1 are complete. Inspect the existing repository, preserve its working routes, components, tokens, and flows, then make focused upgrades only.

This remains a frontend-only prototype. Use local mock data and local client state. Do not add Supabase, PostgreSQL, a real database, backend API, real authentication, payments, production QR, real push notifications, or a fake production API.

## Required outcomes

- Login, create-account, navigation, local mutations, and notification updates feel immediate, premium, and responsive.
- Remove the old unrelated login artwork completely. The supplied reference screenshot is feedback only and must never be used in the product.
- Replace it with a relevant animated electrical-rewards visual.
- All local changes update every relevant open view immediately: no manual refresh.
- Add a reliable PWA foundation: manifest, icons, optional install UX, offline fallback, safe caching, and mobile standalone QA.
- Maintain accessibility, dark mode, reduced-motion support, desktop/mobile responsiveness, and all completed Phase 1/1.1 flows.

---

## 1. Login and Create Account visual redesign

### Remove the current artwork

Remove the oversized lightning bolt, random rings/particles/chain composition, and every instance of any unrelated login decoration. It is visually disconnected from the product and competes with the copy/form. Do not just recolour, shrink, or move it: replace it.

### New concept: Electrical Rewards Network

Build an original, lightweight Three.js visual, preferably React Three Fiber and Drei where compatible. It must communicate:

Ambika Electricals → electrical purchase → membership → reward points.

Use this visual on Login and Create Account pages only. It is a supporting brand element—not a game, stock image, or attention-grabbing animation.

#### Composition

- A compact central circuit trace/current path, made from refined lines rather than a giant bolt.
- Three to five abstract, low-detail electrical/reward objects: LED bulb, modular switch, MCB, cable spool, membership card, and reward-point token.
- Small point tokens move slowly along a circuit path toward a membership/reward token.
- A subtle current pulse every few seconds suggests that purchases become points.
- Deep navy/near-black base, restrained electric-blue highlight, minimal warm amber/gold reward accent, and strong text contrast.
- A nearly invisible circuit-grid texture is optional; never reduce readability.
- Do not use random stock photos, coffee/retail imagery, rainbow colours, giant logos, or copied company branding.

#### Motion and performance

- Use slow floating, gentle current pulse, and occasional point movement only.
- Respect prefers-reduced-motion: render static artwork or greatly reduce motion.
- Do not use frantic rotation, bouncing, confetti, camera movement, heavy bloom, auto-playing video, or large particle systems.
- Lazy-load the Three.js/R3F visual. While it loads, show a visually consistent lightweight static fallback.
- Desktop: contain it entirely in the left auth panel. Mobile: show compact static/low-motion branding above the form or hide the canvas when it impacts usability/performance.
- Canvas is decorative; it cannot obstruct form controls, selection, keyboard navigation, or screen readers.

### Auth UI and copy

- Desktop uses a balanced two-column layout: visual left, focused form right.
- Mobile is form-first: no split screen, overflow, tiny typography, or canvas overlap.
- Keep the Customer / Business switch, with unmistakable active state and keyboard support.
- Keep demo account information separate from live-looking form fields and label it Demo mode.
- Use concise correct copy:
  - Login: Welcome back
  - Login support: Sign in to view your Ambika Electricals rewards.
  - Signup: Start earning rewards
  - Signup support: Create your Ambika Electricals membership in minutes.
- Use shadcn/ui patterns for segmented controls, inputs, password reveal, inline validation, password strength, loading buttons, OTP sheet/step flow, toasts, and only necessary dialogs.
- Use short Motion transitions, normally about 150–250 ms. No artificial delays.

---

## 2. Fast sign-in and navigation

### Performance standard

The prototype must feel instant on a normal laptop and phone:

- Validation appears immediately without full-page render.
- A valid mock login gives brief feedback then navigates promptly; never add 1–3 second fake loading delays.
- Disable only the active submit action to prevent duplicates; do not freeze the page.
- Preserve the application shell where possible. Use compact, route-specific skeletons rather than blank screens.
- Auth screens cannot wait for charts, product images, dashboards, or heavy animation.

### Required implementation work

- Inspect bundle and client-component usage. Avoid unnecessary dependencies.
- Lazy-load Three.js/R3F, Recharts, large modals, and dashboard-only code.
- Never load dashboard charts or all mock data into login/signup routes.
- Split mock data by domain and route; optimize images.
- Use route loading and error UI where appropriate.
- Keep form state through safe UI transitions.
- Use memoization/selectors only when a real re-render issue exists.

### Perceived-speed rules

- Button feedback may say Signing in…, but redirect immediately after local demo validation passes.
- Use optimistic local updates for notification reads, wishlisting, redemption, and mock sale completion.
- If local validation rejects an action, restore the old state and explain why.
- Do not fake network latency to make the app look real.

---

## 3. Instant in-app state and notifications

### Principle

Every mutation updates every relevant currently-open view immediately, without refresh.

Examples:

- Completed sale updates customer points, activity, sales history, dashboard KPIs, and notification centre.
- Reward redemption updates points, cart badge, redemption/activity history, and inventory/availability.
- Read notification updates item style and unread badge.
- New product/reward/customer immediately appears in lists, filters, searches, and selectors.

### State architecture

Keep or introduce the smallest clean typed local store/service boundary consistent with the repository:

- Define typed events: sale.completed, reward.redeemed, notification.created, notification.read, customer.updated, product.created.
- Update one source of truth per mutation; derive each screen from it.
- Mock service interfaces may resemble future backend services but must not pretend to be network requests.
- Persist safe demo preferences where useful: theme, selected role, read state, wishlist, onboarding state.
- Provide Reset demo data for testing.
- Do not place unrelated state in a giant page component.

### Notification centre

- Header bell has an accurate unread badge.
- Use a polished shadcn drawer/popover with category/icon, time, read/unread style, destination/action, and empty state.
- Support read one, mark all read, and clear appropriate items.
- Use a toast for immediate acknowledgement; keep durable mock history in the centre.
- New mock events insert instantly and animate the badge/list item subtly.
- Use relevant types: purchase points, redemption status, tier progress, campaign, low reward stock, staff/sale update.

### Important limit

This phase delivers instant updates inside the same app/browser session. True multi-device realtime and real push notifications need a future backend plus realtime and push infrastructure. Do not claim either is live in Phase 1.2.

---

## 4. PWA foundation

Prepare an installable customer application without pretending that offline transactions or server push already exist.

### Required work

- Add a valid web app manifest: name, short name, description, start URL, display mode, theme/background colours, and purpose-built icons.
- Supply suitable icons, including maskable icon support where feasible. Derive them from the Ambika spark/circuit mark.
- Add Apple/mobile web-app metadata and mobile theme colour.
- Offer an optional, non-intrusive install prompt only when supported and not dismissed. Never show it on every visit.
- Create an offline fallback page with clear offline explanation plus retry/back action.
- Cache app shell and safe static assets for fast return visits.
- Do not cache mutable sale/redemption/auth state as if it were durable production data.
- Ensure safe update behavior: a new deployment should not trap users on old UI.

### Offline rules

- Previously loaded routes/assets can stay available where safe.
- Clearly identify actions requiring an active demo session.
- Never fake success for sale, redemption, payment, or authentication while offline.
- Preserve form drafts locally when practical and recover gracefully.

### PWA QA

Verify or document manifest validity, icon rendering, supported-browser installability, standalone mobile layout/safe areas, offline fallback, update behavior, and normal-browser visual stability.

---

## 5. Accessibility and design QA

Perform a focused pass on auth and notifications:

- Consistent spacing, typography, input/button heights, borders, radii, focus rings, and dark-mode contrast.
- Comfortable mobile touch targets.
- Full keyboard access to role switch, form, password reveal, OTP flow, drawers, and notification actions.
- Semantic labels and announced validation errors.
- Decorative canvas must have no noisy screen-reader output.
- Status cannot rely on colour alone.
- Skeletons/loading states cannot cause layout shift or block controls.
- Test narrow mobile, mobile landscape, tablet, laptop, and large desktop.

---

## 6. Acceptance scenarios

### A. Customer demo sign-in

1. Open /login.
2. See the relevant Electrical Rewards Network visual, never the old bolt/rings image.
3. Form works immediately while visual lazy-loads or shows fallback.
4. Sign in with demo credentials.
5. Validation, feedback, and dashboard navigation are fast with no artificial wait.

### B. Live state without refresh

1. Staff completes a mock sale for Rahul.
2. Points, activity, sales, KPIs, unread count, and notification update immediately.
3. Open notifications and see the new event.
4. Mark it read; badge and item update instantly.

### C. PWA readiness

1. Supported browser provides a tasteful optional install experience.
2. Installed app has correct icon and standalone layout.
3. Offline shows a clear fallback, not a broken blank page.

### D. Motion and accessibility

1. Keyboard user completes login and notification tasks.
2. Reduced-motion user gets static/reduced canvas motion.
3. Mobile form has no clipping, visual overlap, or blocked controls.

---

## 7. Definition of done

Phase 1.2 is complete only when:

- Old irrelevant login artwork is removed everywhere.
- Login and Create Account have a new relevant, premium, lightweight Three.js/R3F electrical-rewards visual and fallback.
- Visual is responsive, reduced-motion aware, and lazy loaded.
- Auth copy, hierarchy, validation, demo context, and loading states are polished.
- Login and common local actions are genuinely fast without fake delays.
- Shared local state gives instant cross-screen updates in session.
- Notification centre, unread badge, and read actions update without refresh.
- Manifest, icons, install UX, offline fallback, and safe caching are implemented and checked.
- No backend, real authentication, production realtime service, or real push service is added.
- Existing Phase 1/1.1 desktop and mobile flows stay functional.

## Final instruction

Implement only this focused Phase 1.2 upgrade. Do not rebuild working Phase 1/1.1 features or use the supplied screenshot as an asset. After work, QA the four scenarios above and report changed files, verification results, and the backend-dependent work reserved for a later phase.
