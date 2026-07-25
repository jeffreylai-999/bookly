# Library Management Dashboard — Design Spec

**Date:** 2026-07-23
**Status:** Approved (brainstorming) → ready for implementation plan
**Source:** `docs/plans/library-dashboard-plan.md`
**Revised:** 2026-07-23 — gap-fix pass: mutation RPCs + pg_cron execution model, `notifications` table, `overdue_loans` view, hold↔copy link, barcode prefixes, lost/damaged fine basis, payment-void semantics, suspended-vs-blocked, renewal base, server-side pagination, library timezone, testing decision, ngx-charts → ECharts.
**Revised:** 2026-07-24 — security review pass (`2026-07-23-library-dashboard-review.md`): SECURITY DEFINER RPCs + direct-write revokes, `profiles.role` lockdown, audit_log insert lockdown, checkout copy-status matrix, row-lock concurrency, `place_hold` rules, `mark_ready` RPC, damaged-override as audited param, unique constraints, pg_cron UTC/local-time gating, SSR render modes, env hygiene. Added §10 Localization (Transloco runtime i18n). Verify-pass residuals: `notifications` insert lockdown, `set_copy_status` RPC for Catalog status actions.
**Revised:** 2026-07-24 (2) — second verify pass: `set_member_status` RPC + column-level `GRANT UPDATE` excluding `status` on members/copies, `log_audit` hardening (actor from `auth.uid()`, action allowlist), partial unique indexes (loans/holds), `checkin` params incl. `fill_hold`, `days_late` in library-local calendar days, overdue-notify anti-join idempotency, `lost_fee_default` fallback, "return" = check-in wording.
**Revised:** 2026-07-24 (4) — grilling/domain-modeling pass: canonical term "Hold" (not reservation), walk-up checkout allowed despite waiting holds (deliberate asymmetry vs renew), renew gates extended (suspended/blocked, fine threshold, already-overdue = fine-eraser hole), block-threshold on materialized fines only, queue order enforced in RPCs (no `hold_id` param), money-never-flows-backward (waive = remaining only, no refunds), promotion ignores member status, checkout auto-resolves own hold (`fulfilled`), current-rate-at-finalization, waiting holds never expire, no notification pruning, Reports metric definitions. Glossary → `CONTEXT.md`; ADRs 0001–0003 in `docs/adr/`.
**Revised:** 2026-07-24 (3) — third verify pass: check-in hold-fill gated on `condition = 'ok'`, lost-replaces-overdue / damaged-stacks fine policy, column-level `GRANT INSERT` excluding `status`, DELETE revoked on simple aggregates, `profiles.role` via column grant, `SET search_path = ''` on all definers, title-row lock for hold queue positions.

## 1. Purpose & scope

Staff-facing back-office library desk tool. Scan-first daily work (member card, item barcode) with type-to-search fallback. Not a patron portal.

**Build target:** portfolio / prototype, but on a real serverless backend (Supabase). All tiers in scope for this spec: P0 desk core, P1 Overview launchpad, P2 Reports — plus admin Settings and Audit surfaces.

**Out of scope (v1, deliberate):** patron self-service, multi-branch / transfers, interlibrary loan, reading history / recommendations, MARC / ISBN lookup cataloging standards, external notification pipeline (email/SMS — in-app bell only), inventory receiving / shelf reconciliation, staff account management (staff/admin users are created by the seed script; additional users via Supabase dashboard — no in-app surface).

## 2. Stack & rendering

- **Angular 22** — standalone components, signals, Signal Forms (`@angular/forms/signals`), native control flow, `inject()`.
- **Tailwind CSS** — added to the Angular 22 build (not yet installed). Custom component styling; no CSS component library.
- **Angular CDK** — primitives for behavior/a11y: overlay, focus-trap, live-announcer, a11y, cdk table/virtual-scroll where useful.
- **Supabase** — Postgres, Auth, Row-Level Security, Realtime, **Postgres functions (RPCs) for all multi-table mutations, pg_cron for scheduled jobs**.
- **ngx-echarts + Apache ECharts** — Reports charts. (ngx-charts dropped: Angular 22 support is alpha-only as of 2026-07, see swimlane/ngx-charts#2085.)
- **Transloco** — runtime i18n (see §10). Chosen over `@angular/localize`: compile-time i18n means one build + one SSR server bundle per locale; runtime switching fits a single-deploy portfolio app.
- **Vitest** — testing (already configured). TDD.

**Rendering: SSR retained** (skeleton ships SSR + Express). Consequences:
- Auth via `@supabase/ssr` — cookie-based sessions, separate server-client and browser-client instances.
- **Server routes:** replace the skeleton's `path: '**', renderMode: Prerender` — prerendering cannot see cookies, so every authed route would break. All app routes use `RenderMode.Server`; `/login` may stay `Server` too (it reads the session cookie to redirect already-authed users). No `Prerender` anywhere in v1.
- ECharts is browser-only: chart components render client-side only, guarded with `afterNextRender` / `isPlatformBrowser`. No chart rendering during server render.

## 3. Architecture / layering

- **`core/supabase`** — single typed Supabase client factory (server + browser variants), generated DB types.
- **Repository services** (one per aggregate: members, catalog, loans, holds, fines, settings, audit) — own ALL Supabase queries; return typed rows. Nothing outside repositories touches Supabase. Reads use the query builder with **server-side pagination** (`.range()` + exact count; repositories expose `page`/`pageSize`). **All multi-table mutations go through Postgres functions via `.rpc()`** — see "Mutation RPCs" in §6.
- **Signal store services** — view state as signals (current member, loan tabs, filters, pagination); call repositories; expose `computed()` derived state. Use `set`/`update`, never `mutate`.
- **Feature components** — read signals, dispatch actions; small, one page each.
- **`shared/ui`** — custom Tailwind components on CDK primitives: table, dialog, toast, badge, empty-state, pagination, stat-card, avatar, form fields.

**Cross-cutting services (`providedIn: 'root'`, prefer `@Service` decorator):**
- `AuthService` — session signal, role, login/logout.
- `AuditService` — read-side helper for the audit viewer. Audit rows for flow mutations are written **inside the mutation RPCs** (same transaction); `AuditService.log(...)` is only used for the few single-table client-side mutations (e.g. member profile edit).
- `SettingsService` — loads member_types + app_settings into signals; flows read rules from here.
- `NotificationService` — loads `notifications` + subscribes to its Realtime inserts → bell signal + toasts; marks read.
- `ScanService` — barcode capture + resolution (member card vs item barcode).
- `ToastService` — queue signal.

## 4. Data model (Supabase / Postgres)

All tables: `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`, RLS enabled.

- **profiles** — `id` (= `auth.uid`), `full_name`, `email`, `role` (`staff` | `admin`), `locale` nullable (UI language preference). Drives gating. **`role` is immutable from the client** — own-row RLS update policy **plus** column-level `GRANT UPDATE (…)` that excludes `role` (RLS is row-level and cannot except a column on its own — same grant pattern as `members.status` / `copies.status`); role changes happen only via service role (Supabase dashboard / seed script). No self-promotion path.
- **member_types** — `name`, `loan_period_days`, `renewal_limit`, `borrow_cap`, `fine_rate_per_day`, `hold_expiry_days`. **The per-type rules layer**, editable in Settings.
- **members** — `name`, `member_type_id` fk, `email` nullable, not unique (families share an address), `phone`, `avatar_url`, `status` (`active` | `suspended` | `blocked`), `joined_at`, `card_barcode` unique (scan).
- **titles** — `title`, `author`, `genre`, `isbn` unique nullable, `description`, `replacement_cost` numeric (basis for lost-item fines).
- **copies** — `title_id` fk, `barcode` unique (scan), `status` (`available` | `on_loan` | `on_hold_shelf` | `lost` | `damaged` | `retired`).
- **loans** — `copy_id`, `member_id`, `checked_out_by` (profile), `checked_out_at`, `due_at`, `returned_at` nullable, `renew_count` default 0, `status` (`active` | `returned`). **No stored `overdue` status** — overdue is always derived (see below).
- **holds** — `title_id`, `member_id`, `queue_position`, `status` (`waiting` | `ready` | `fulfilled` | `cancelled` | `expired`), `copy_id` nullable fk (set when the hold is marked ready — records which physical copy sits on the hold shelf for which member), `ready_at` nullable, `expires_at` nullable.
- **fines** — `member_id`, `loan_id`, `amount`, `amount_paid` default 0, `reason` (`overdue` | `damaged` | `lost`), `status` (`outstanding` | `paid` | `partial` | `waived`), `accrual_rule_snapshot` jsonb. (`void` removed from the enum — fines are waived, never voided; voiding applies to payments only.)
- **payments** — `fine_id`, `amount`, `method`, `recorded_by` (profile), `voided_by` (profile) nullable, `void_reason` nullable.
- **audit_log** — `actor` (profile), `action`, `entity_type`, `entity_id`, `detail` jsonb, `created_at`. Append-only.
- **notifications** — staff-wide feed backing the bell: `type` (`hold_ready` | `overdue` | `payment_recorded`), `entity_type`, `entity_id`, `detail` jsonb (names/amounts needed to render the message — **no pre-baked text columns**; the UI renders localized text from `type` + `detail`, so notifications appear in each reader's language, see §10), `read_at` nullable (shared read state — acceptable for a small desk team), `created_at`. Rows inserted by the mutation RPCs (hold ready, payment recorded) and the daily overdue pg_cron job. **This is what the bell subscribes to and what persists unread state across refreshes.**
- **app_settings** — singleton row (enforced by a constant-pk check): system-wide rules not per-type (currency, `timezone` — library-local tz for "due today" / date bucketing, `default_locale`, fine block-threshold, `damaged_fee_default`, `lost_fee_default` (fallback when `titles.replacement_cost` is null), notification triggers, default report range).

**Derived, not stored:** overdue status (`due_at < now()` AND `returned_at IS NULL`); fine accrual (finalized at return time from rule + days late, then snapshotted into `fines.accrual_rule_snapshot`). **Fine rate is current-rate-at-finalization** (deliberate): a mid-loan rate or member-type change bills all late days at the rate in force at check-in — policy is "policy now", not a per-loan contract. The snapshot is the *record* of what was applied, not a *contract* set at checkout.

**`overdue_loans` view (single source of truth for overdue + projections):** joins `loans` × `members` × `member_types`, exposes `days_late` and `projected_fine` (`days_late × fine_rate_per_day`). **`days_late` counts library-local calendar days** past the due date (dates bucketed in `app_settings.timezone`), not raw UTC interval — avoids off-by-one fines at day boundaries. Circulation's overdue tab, Overview's "top overdue w/ accruing fine", and the check-in fine calculation all read the same formula — no client-side duplicate, no drift.

**Barcode conventions:** member cards are prefixed `MBR-`, copy barcodes `BK-` (seed + add-forms enforce via CHECK constraints). ScanService routes on prefix; a scan with no/unknown prefix falls back to exact lookup on `copies.barcode` first, then `members.card_barcode`; no match → error toast.

**Mutation RPCs (Postgres functions, called via `.rpc()`):** `checkout`, `checkin`, `renew_loan`, `place_hold`, `cancel_hold`, `mark_ready`, `set_copy_status`, `set_member_status`, `record_payment`, `waive_fine`, `void_payment`. Each is a single transaction that (a) re-validates the business rules server-side (member status, fine block-threshold, borrow cap, renewal limit — the UI pre-checks are UX only, the RPC is the enforcement layer), (b) applies all row changes, (c) writes the `audit_log` row, and (d) inserts `notifications` rows where applicable. Raises a typed exception on rule violation; repositories surface it as a typed error.

**RPC security model:** all mutation RPCs are `SECURITY DEFINER` **with `SET search_path = ''`** (all object references schema-qualified) — standard hardening against search-path hijack; Supabase's linter flags definers without it. Admin-gated RPCs/branches (`waive_fine`, `void_payment`, `set_member_status` block/unblock, `set_copy_status` retire/un-retire) **assert `role = 'admin'` inside the function body** — definer functions bypass RLS, so RLS policies alone do not protect them. **Concurrency:** `checkout`, `checkin`, `renew_loan`, and hold-fill take `SELECT … FOR UPDATE` on the copy row (and the member row in `checkout`) before validating — two desks scanning the same copy serialize instead of double-issuing. `place_hold` / `cancel_hold` lock the title row `FOR UPDATE` before touching queue positions — concurrent placements can't compute the same `queue_position`, cancels reorder atomically.

**Integrity constraints (defense below the RPCs — rule checks can race, constraints cannot):** partial unique indexes `UNIQUE (copy_id) WHERE status = 'active'` on `loans` (a copy can never be double-issued) and `UNIQUE (member_id, title_id) WHERE status IN ('waiting','ready')` on `holds` (no duplicate active hold per member per title).

**Scheduled jobs (pg_cron):** pg_cron schedules run in UTC on Supabase, and `app_settings.timezone` is editable at runtime — so a fixed UTC cron hour can't track "library-tz morning". Mechanism: **both jobs are scheduled hourly**; the function body no-ops unless `now() AT TIME ZONE app_settings.timezone` is in the morning hour (08:00–09:00) and it hasn't already run that library-local day (last-run marker in `app_settings`). Effective cadence: once daily, library-local morning, DST-proof.
- `expire_holds` (effective daily — day-granularity expiry, hour/minute accuracy not needed) — holds past `expires_at` → `expired`, shelf copy released, next `waiting` hold promoted (→ `ready`, copy assigned, notification inserted) or copy → `available`. Desk fallback for the up-to-a-day lag: the `checkout` RPC treats a `ready` hold past `expires_at` as expired (lazy expiry), so a stale shelf copy never blocks a same-day checkout.
- `notify_overdue` (effective daily) — inserts one `notifications` row per overdue loan that has none yet (**anti-join on existing `overdue` notifications per loan** — idempotent across reruns, and immune to `due_at` shifting on renewal, unlike a due-date watermark). Loans stay `active`; overdue remains derived.

**RLS / grants (defense in depth — the API surface is locked, not just the UI):**
- All tables: readable by any authenticated user.
- **Flow-critical tables — no direct writes at all:** `loans`, `holds`, `fines`, `payments` have INSERT/UPDATE/DELETE revoked from `authenticated`; `copies.status` changes likewise go through RPCs (non-status copy fields remain staff-editable). The only mutation path is `GRANT EXECUTE` on the SECURITY DEFINER RPCs. A staff JWT talking straight to PostgREST cannot skip rules, audit, or notifications.
- **Simple aggregates — staff INSERT/UPDATE under RLS, no DELETE:** `members`, `titles`, `copies` — staff-writable; audit via `AuditService.log`. **Column mechanism:** `status` is excluded from **both** the column-level `GRANT UPDATE (…)` **and** `GRANT INSERT (…)` on `members` and `copies` — an INSERT can't smuggle in `blocked`/`on_loan`/`retired`; the omitted column takes its default (`active` / `available`). Status changes physically cannot bypass their RPCs (`set_member_status`, `set_copy_status`). **DELETE is revoked** on all three — lifecycle is status-based (`retired`, `blocked`); row deletion is service-role only, so history can't silently vanish.
- `notifications`: INSERT/DELETE revoked from `authenticated` — rows come only from definer RPC bodies and the pg_cron jobs (no bell spam / fake events from a JWT). Staff UPDATE is column-limited to `read_at` (mark-read).
- Admin-only (policy-enforced): `member_types`, `app_settings`, member block, copy retire.
- `profiles`: own-row RLS policy + column grant excluding `role` (see table note); no client path to role changes.
- `audit_log`: **no direct insert for anyone** — rows are written only inside SECURITY DEFINER RPC bodies (and `AuditService.log` calls a tiny definer `log_audit` RPC). No update/delete for anyone. **`log_audit` hardening:** `actor` is derived from `auth.uid()` inside the function — never a parameter — and `action` is validated against an allowlist of client-side codes (`member.update`, `title.update`, `copy.update`, …); flow codes (`loan.checkout`, `fine.waive`, …) are written only by their own RPCs. History cannot be forged from a JWT.

**Realtime:** the bell subscribes to a single channel — `notifications` inserts. (Hold-ready, overdue, and payment events all arrive as `notifications` rows written by RPCs / pg_cron; no need to watch `holds`/`loans`/`payments` directly, and derived overdue would never emit a row-change event anyway.)

**Seed:** a Node script using the service-role key (plain `seed.sql` cannot create auth users) — creates 1 staff + 1 admin auth user via the Auth admin API, then inserts profiles, member_types (defaults), and sample titles/copies/members/loans/holds/fines for a populated demo.

**Env hygiene:** service-role key lives ONLY in the Node seed script's environment — never in Angular code, never in any bundled config. `.gitignore` gets `.env*`; a committed `.env.example` carries the Supabase URL + anon key placeholders only. Leaking the service key = full RLS bypass, so it never leaves the local machine.

## 5. Routing & shell

Routes (lazy-loaded feature components; `authGuard` on all except `/login`):

| Path | Page | Guard |
|------|------|-------|
| `/login` | Login | public |
| `/` | Overview (P1 launchpad) | auth |
| `/circulation` | Check-out / check-in / monitoring tabs | auth |
| `/catalog` | Titles + copies | auth |
| `/members`, `/members/:id` | List + detail | auth |
| `/holds` | Reservations queue | auth |
| `/fines` | Fines + payments | auth |
| `/reports` | Analytics (P2) | auth |
| `/settings` | Rules + app_settings | admin |
| `/audit` | Audit log viewer | admin |

**Guards:** `authGuard` (no session → `/login`); `adminGuard` (blocks `/settings`, `/audit`; admin-only actions hidden in UI + enforced by RLS).

**Global shell** (`AppShell` wraps router-outlet):
- Sidebar nav (9 items, active state; admin items hidden for staff).
- **Scan-anywhere input** — global keyboard-wedge listener; resolves barcode by prefix (`MBR-` → member, `BK-` → copy; fallback order copies-then-members, see §4 barcode conventions) → routes to correct flow. Wedge input is distinguished from typing by inter-key timing burst + terminator (Enter); suppressed while focus is inside a text input. Debounced, focus-managed.
- **Notification bell** — signal fed by the `notifications` table (initial load + Realtime inserts); unread badge persists across refresh (`read_at`), toast on arrival, dropdown list. Triggers: hold ready, item overdue (daily job), payment recorded. **No retention/pruning (v1)** — bounded at the query: bell loads most-recent ~50 + separate unread-count query; `audit_log` likewise unbounded by design (append-only history).
- Contextual top-bar action button (per-route).
- Toast host (CDK overlay + live-announcer).

## 6. Key flows & business rules

**Check-out** (`checkout` RPC): identify member (scan card / search) → block if `status` = suspended/blocked → block if outstanding fine ≥ `app_settings` block-threshold → block if active loans ≥ `member_type.borrow_cap` → scan/add copies → `due_at = now + member_type.loan_period_days` → confirm → insert loans, set copies `on_loan`, audit log — one transaction; rules re-checked inside the RPC; copy + member rows locked `FOR UPDATE`.
- **Copy-status matrix:** checkout allowed only for `available` (**even when the title has waiting holds** — walk-up member physically has the copy; deliberate asymmetry vs the renew hold-block, which frees copies at zero desk friction), or `on_hold_shelf` when the `ready` hold belongs to **this** member (→ check out + hold `fulfilled`; expired ready holds lazily expired here). Rejected with a specific message: `on_hold_shelf` held for another member, `on_loan` ("already checked out — check in first"), `lost` / `damaged` / `retired`.
- **Checkout auto-resolves the member's own hold on the title:** if the member has a `ready` or `waiting` hold on the checked-out title and a *different* copy is issued, the hold → `fulfilled` (member got the title — that's fulfillment, ready or not); a `ready` hold's shelf copy is released in the same transaction (promote next `waiting` hold or → `available`). Invariant: a member never simultaneously holds a title and has an active hold on it.

**Check-in** (`checkin` RPC — params: `copy_barcode`, `condition` (`ok` | `damaged` | `lost`), `damaged_amount` optional, `fill_hold` boolean — the staff "fill hold" choice is an explicit parameter, not RPC-side guesswork): scan copy → branch on `condition`:
- **lost** → fine = `titles.replacement_cost` (fallback `app_settings.lost_fee_default` when null); **replaces** any accrued overdue fine — no stacking, the member pays replacement cost, not replacement + late days. Copy `lost`. **Flow ends here** — no hold fill; a `waiting` hold stays waiting for the next copy.
- **damaged** → if overdue, the overdue fine is created too (**stacks** — late return and damage are distinct harms); damage fine defaults to `app_settings.damaged_fee_default`, staff override via the `damaged_amount` param, recorded in the audit `detail` (who charged what, and that it deviated from the default). Copy `damaged`. **Flow ends here** — no hold fill.
- **ok** → if overdue, fine = `projected_fine` from the `overdue_loans` view (same formula the UI showed), snapshot rule, create `fines` row → **hold fill** (only reachable on `ok`): if a `waiting` hold exists for the title, offer "fill hold" → hold `ready` + `copy_id` set, copy `on_hold_shelf`, `expires_at = now + hold_expiry_days`, notification inserted → else copy `available`.

All branches: set `returned_at`, loan `returned`. One transaction, audit log inside.

**Renew** (`renew_loan` RPC): blocked if `renew_count >= member_type.renewal_limit`, OR the title has `waiting` holds, OR member is suspended/blocked, OR member's outstanding fines ≥ block-threshold, OR **the loan is already overdue** (renewing would reset `due_at` and erase the accrued-but-not-yet-finalized overdue fine — overdue loans must be checked in, fine finalized, then re-checked-out; typed error code per gate). Else `due_at = now() + member_type.loan_period_days` (renewal period runs from the renewal moment, not stacked on the old due date), increment `renew_count`. Audit log.

**Holds** (`place_hold` / `cancel_hold` / `mark_ready` RPCs + `expire_holds` job): place (append queue), cancel (reorder remaining queue positions — atomic inside the RPC), mark ready, notify, auto-release on expiry via pg_cron (expired → shelf copy freed → promote next in queue or copy `available`). Queue position + expiry shown. **Only `ready` holds expire** (`hold_expiry_days` = shelf time); `waiting` holds live until cancelled — no staleness auto-cancel. UI aid instead: Holds table shows hold age so aged queues are staff-visible.
- **`place_hold` rules:** rejected if the member already has a `waiting`/`ready` hold on the title, or currently has a copy of that title on loan. Member must be `active` (not suspended/blocked). Queue positions assigned under the title-row lock (see RPC security model) — no duplicate positions under concurrency.
- **`mark_ready`** (the Holds-page action, for when an available copy is pulled for the queue outside of check-in): staff scans/picks an `available` copy of the title → hold `ready` + `copy_id` set, copy `on_hold_shelf`, `expires_at = now + hold_expiry_days`, notification inserted. Same transaction shape as the check-in hold-fill branch.
- **Queue order is enforced, not advisory:** neither `mark_ready` nor `checkin(fill_hold)` takes a `hold_id` — both take the copy and resolve **the lowest `queue_position` `waiting` hold** for the title internally (under the title-row lock). Queue skipping is physically impossible; the Holds-page action is per-title ("pull copy for this queue"), not per-row. Legit skips (head member unreachable / defers) = cancel the head hold — audited, explicit, queue renumbers.
- **Promotion ignores member status:** suspension blocks checkout, not queue standing — a suspended/blocked head is promoted anyway (member resolves at desk: staff lifts suspension / takes payment, then checks out the ready hold; unresolved holds recover via expiry). No skip/pass-over logic. `place_hold` still requires `active` — status gating happens at placement and checkout, never at promotion.

**Copy status outside check-in** (`set_copy_status` RPC — owns the Catalog "mark lost / damaged / retire" actions): staff may set `available` / `on_hold_shelf` copies to `lost` or `damaged` (shelf-audit finds), and `lost`/`damaged` back to `available` (item resurfaces / repaired); `retired` and un-retire assert `role = 'admin'` in the function body. Copies currently `on_loan` are rejected — loss/damage during a loan goes through the `checkin` RPC so the fine logic runs. If the copy sits on the hold shelf, its `ready` hold is released back to the queue (next copy or re-wait). Audited.

**Fines / payments:** auto-generated on overdue/damaged/lost return; accrual rule visible. Record full/partial payment (`record_payment` RPC) → receipt confirmation, update `amount_paid` + status (`paid`/`partial`). Waive (`waive_fine` RPC — admin, reason required, audited). Void payment (`void_payment` RPC — admin, reason required, audited): marks the payment voided, then **recomputes** the fine — `amount_paid = sum(non-voided payments)`, status back to `outstanding`/`partial`/`paid` accordingly. Member balance (`sum(amount − amount_paid)` over non-waived fines) exposed to the Circulation gate. **Block-threshold gates on materialized fines only** — projected fines (`overdue_loans.projected_fine`) never block checkout (provisional: waivable, replaced on lost, ticks daily); the Circulation member panel shows both ("balance $X · projected +$Y") so staff sees the full picture. **Money never flows backward (v1):** waive forgives the **remaining balance only** — `amount_paid` untouched, prior payments stand (a wrong payment is `void_payment`'s job, not waive's). A found lost copy is restored via `set_copy_status`; its paid replacement fine is unaffected — no refund surface; any cash refund is off-system, noted in audit `detail`.

**Member status** (`set_member_status` RPC — the only write path to `members.status`, audited): `suspended` = temporary desk-level stop, staff can set and lift (e.g. repeated late returns); `blocked` = serious/indefinite, the block/unblock branch asserts `role = 'admin'`. Both block checkout; they differ in who can apply/remove them and messaging.

**Gating recap (admin-only, RLS + UI):** waive, void payment, member block, copy retire, settings edits, audit access. (Member suspend is staff-level.)

## 7. Per-page feature summary

- **Circulation:** check-out flow, check-in flow (this IS the "return" action — one flow, not two), renew, returned-timestamp display, monitoring tabs (active / overdue / returned), member/title search, loan table, empty states.
- **Catalog:** title/author search, genre filter, result count, per-title copy availability (X of Y + who holds the rest), inline start-checkout / place-hold, add title / edit copy / mark lost-damaged / retire, paginated table (numbered), empty state with clear-filters.
- **Members:** name search, status filter, result count, member detail (current loans, hold queue, fine history, contact info), add / edit / suspend-block, paginated table (avatar / type / loans / fines / joined / status), empty state.
- **Holds:** place / cancel / mark ready / notify / auto-release, queue position + expiry, status filter, result count, table, empty state, wired to check-in.
- **Fines:** origin explicit + accrual rule visible, record full/partial payment + receipt, waive w/ reason (audited), 3 summary stat cards, status filter, table, empty state, balance → Circulation.
- **Overview (P1):** quick-action strip (checkout / check-in), action lists w/ empty states (holds ready, due today — bucketed in `app_settings.timezone`, top overdue w/ accruing fine from the `overdue_loans` view), recent activity feed (from audit_log), decision stat cards (overdue count, holds waiting, fines outstanding), 14-day trend as small widget.
- **Reports (P2):** range selector (7/14/30-day), dynamic subtitle, ECharts reports, CSV export per report. **Metric definitions** (range-scoped unless noted, dates bucketed in `app_settings.timezone`):
  - *Overdue aging* — current overdue loans (`overdue_loans`) bucketed by `days_late`: 1–7, 8–14, 15–30, 30+. Present-state snapshot, not range-scoped.
  - *Dead stock* — titles with zero checkouts in range and ≥1 non-retired copy (range-relative, not "never loaned").
  - *High-demand* — top titles by checkouts in range; tie-break by current waiting-hold count.
  - *Fine collection* — per-day non-voided `payments` sum vs per-day `fines.amount` created (collected vs incurred).
  - *New-member growth* — `members.joined_at` count per day.
  - *Peak hours* — `loans.checked_out_at` histogram by hour-of-day (library tz); check-outs only (desk-load proxy).
  - *Genre breakdown* — checkouts in range grouped by `titles.genre`.
- **Settings (admin):** edit member_types (rules) + app_settings.
- **Audit (admin):** searchable / filterable audit_log table.

## 8. Forms

Signal Forms (`@angular/forms/signals`) with schema validation for: login, add/edit member, add title / edit copy, record payment, waive fine, void payment, member_type rules, app_settings.

## 9. Testing

Vitest, TDD (red → green → refactor).
- **Repositories:** against a **mocked Supabase client** (decided — fast, deterministic, no network in unit runs).
- **DB logic (RPCs, view, RLS, cron functions):** SQL test file run against the local Supabase stack (`supabase start`) during development; not part of the Vitest unit run.
- **Stores:** with fake repositories.
- **Components:** with fake stores; a11y assertions via axe. MUST pass AXE + WCAG AA (focus management, contrast, ARIA).

## 10. Localization (i18n)

- **Transloco** runtime i18n. One JSON translation file per locale (feature-scoped files when they grow); all UI strings are translation keys **from the first component** — retrofitting keys is the expensive path.
- **v1 locales:** `en` (default, complete). The structure ships multi-locale-ready; adding a language = adding one JSON file + registering Angular locale data.
- **Locale resolution:** `profiles.locale` (per-staff preference, editable in their own profile) → `app_settings.default_locale` → `en`. Switcher in the app shell; sets `<html lang>` on change (a11y/screen readers).
- **Dates / numbers / currency:** Angular locale data registered per supported locale; `CurrencyPipe` currency code from `app_settings.currency`; dates rendered in `app_settings.timezone`.
- **Dynamic content is NOT translated:** book titles, author names, genres, member names render as stored.
- **Server-generated events carry data, not text:** `notifications.detail` jsonb + `type` render through translation keys client-side (each staff member reads the bell in their own language); `audit_log.action` is a machine code (`loan.checkout`, `fine.waive`) that the Audit viewer renders localized. RPC rule-violation exceptions likewise carry error codes, mapped to localized messages in the UI.
- **Missing-key handler** warns loudly in dev; component tests run with the `en` file so missing keys fail visibly.

## 11. Delivery phases (tiers = phases; each ends shippable + tested)

1. **Foundation** — Tailwind + CDK setup; Supabase project, schema migration (incl. `notifications`, `overdue_loans` view, SECURITY DEFINER mutation RPCs + write revokes/grants, pg_cron jobs), RLS, seed script (Node + service role, `.env` hygiene per §4); typed client (`@supabase/ssr` server + browser); server-route render modes (§2); Transloco setup + `en` locale (§10); AuthService + guards + login; app shell (sidebar, toast host); shared UI kit.
2. **P0 desk core** — Circulation → Members → Catalog → Holds → Fines (this order; each unlocks the next's wiring). Audit logging + Settings-read wired in as built.
3. **Admin surfaces** — Settings editor page, Audit viewer page.
4. **P1 Overview** launchpad + notification bell (Realtime on `notifications`).
5. **P2 Reports** + ngx-echarts/ECharts (client-only render) + CSV export.
