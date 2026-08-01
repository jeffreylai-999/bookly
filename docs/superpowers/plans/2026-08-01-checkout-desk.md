# Checkout Desk Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Circulation check-out tracer bullet: identify a member, scan available copies, create loans via a security-definer `checkout` RPC, plus global scan-anywhere routing.

**Architecture:** Postgres owns enforcement (`checkout` RPC + partial unique index + row locks). Angular adds a `circulation/` feature (repository → signal store → page) and a shell-level `ScanService` for wedge barcodes. UI follows `DESIGN.md` tokens; server returns error codes, Transloco localizes.

**Tech Stack:** Angular 22 + signals, Supabase (Postgres RPCs), Vitest, Transloco, Docker psql SQL tests.

## Global Constraints

- Mutations only via SECURITY DEFINER RPCs with `SET search_path = ''` (ADR 0001).
- No stored `overdue` loan status (ADR 0002).
- Server emits machine codes; UI localizes (ADR 0003).
- Vocabulary: Member / Title / Copy / Loan / Check-out / Check-in (CONTEXT.md).
- Preserve Bookly design tokens from `DESIGN.md` (do not invent a new palette).
- Node `>=22.22.3` or 24+ for Angular CLI.
- Branch: `cursor/checkout-desk-1d7b` off `feat/checkout`.

## File map

| Path | Responsibility |
| --- | --- |
| `supabase/migrations/20260801000000_checkout.sql` | `app_settings`, `fines` (balance only), `loans`, `checkout` RPC, grants |
| `supabase/tests/checkout_gates.sql` | Gate re-validation, audit, direct-insert reject |
| `supabase/tests/checkout_concurrency.sql` + runner | Two concurrent checkouts → one wins |
| `scripts/run-checkout-*-test.mjs` | Docker psql runners |
| `src/app/core/supabase/database.types.ts` | Regenerated types |
| `src/app/circulation/*` | Types, repo, store, page, specs |
| `src/app/core/scan/*` | Scan-anywhere wedge service + specs |
| `src/app/shell/shell.ts` | Boot scan listener |
| `src/app/app.routes.ts` | `/circulation` → Circulation |
| `public/i18n/en.json` | Circulation + scan keys |

---

### Task 1: SQL schema + checkout RPC

**Files:**
- Create: `supabase/migrations/20260801000000_checkout.sql`
- Create: `supabase/tests/checkout_gates.sql`
- Create: `scripts/run-checkout-gates-test.mjs`
- Modify: `package.json` (add `test:sql:checkout`)

**Produces:**
- `public.app_settings` singleton with `fine_block_threshold`, `currency`, `timezone`, `default_locale`, fee defaults
- `public.fine_status` / `public.fine_reason` enums + `public.fines` (readable; no authenticated writes)
- `public.loan_status` enum + `public.loans` (no authenticated writes) + partial unique `UNIQUE (copy_id) WHERE status = 'active'`
- `public.checkout(p_member_id uuid, p_copy_barcodes text[]) returns setof public.loans`
- Error codes: `not_authenticated`, `profile_missing`, `member_not_found`, `member_suspended`, `member_blocked`, `member_fine_blocked`, `member_borrow_cap`, `copies_required`, `copy_not_found`, `copy_on_loan`, `copy_on_hold_shelf`, `copy_lost`, `copy_damaged`, `copy_retired`, `duplicate_barcode`
- Audit action `loan.checkout` with detail `{ copy_ids, barcodes, due_at, member_id }`
- Hold-shelf: reject all `on_hold_shelf` with `copy_on_hold_shelf` until Holds slice owns fulfillment

- [ ] **Step 1: Write failing SQL gate test** (`checkout_gates.sql`) covering: happy path loan+due+on_loan+audit; suspended/blocked/borrow_cap/fine_block distinct codes; copy status matrix codes; direct `insert into loans` → `insufficient_privilege`.

- [ ] **Step 2: Run test → expect fail** (function/table missing). Requires Docker + `pnpm supabase:start`.

- [ ] **Step 3: Write migration** implementing schema + RPC (lock member + each copy `FOR UPDATE`; compute outstanding fines; due_at = now + loan_period_days).

- [ ] **Step 4: Reset DB, re-run test → pass.**

- [ ] **Step 5: Commit.**

---

### Task 2: Concurrent checkout SQL test

**Files:**
- Create: `supabase/tests/checkout_concurrency.sql` (setup) + `scripts/run-checkout-concurrency-test.mjs`
- Modify: `package.json` (`test:sql:checkout-concurrency`)

**Produces:** Script opens two concurrent authenticated sessions that both call `checkout` for the same available copy; asserts exactly one loan and one success.

- [ ] **Step 1: Write concurrency runner + SQL setup.**
- [ ] **Step 2: Run → fail until RPC locks correctly (or pass if Task 1 locks are solid).**
- [ ] **Step 3: Fix if needed; commit.**

---

### Task 3: Regenerate Supabase types

**Files:**
- Modify: `src/app/core/supabase/database.types.ts`
- Modify: `src/app/core/supabase/index.ts` if helpers need exporting

- [ ] **Step 1: `pnpm supabase:types`**
- [ ] **Step 2: Commit.**

---

### Task 4: Circulation repository + store (TDD)

**Files:**
- Create: `src/app/circulation/circulation.types.ts`
- Create: `src/app/circulation/circulation.repository.ts` + `.spec.ts`
- Create: `src/app/circulation/circulation.store.ts` + `.spec.ts`

**Interfaces:**
- `CirculationRepository.findMemberByCard(barcode)`, `searchMembers(q)`, `findCopyByBarcode(barcode)`, `checkout(memberId, barcodes[])`
- `CirculationStore`: selected member, queued copies, busy, errors; `selectMember`, `queueCopy`, `removeCopy`, `confirmCheckout`, `reset`

- [ ] **Step 1: Write failing repo/store specs.**
- [ ] **Step 2: Implement minimal green.**
- [ ] **Step 3: Commit.**

---

### Task 5: Scan-anywhere service (TDD)

**Files:**
- Create: `src/app/core/scan/scan.service.ts` + `.spec.ts`
- Create: `src/app/core/scan/index.ts`
- Modify: `src/app/shell/shell.ts` — start listener in browser
- Modify: `public/i18n/en.json` — `scan.unknownBarcode`, route toasts

**Behavior:**
- Capture keydown bursts (inter-key ≤50ms) ending in Enter; ignore when target is editable
- Prefix `MBR-` → navigate `/circulation?member=<barcode>`
- Prefix `BK-` → navigate `/circulation?copy=<barcode>`
- Else resolve copy then member via repository; unknown → error toast

- [ ] **Step 1: Failing ScanService specs.**
- [ ] **Step 2: Implement + wire shell.**
- [ ] **Step 3: Commit.**

---

### Task 6: Circulation page UI

**Files:**
- Create: `src/app/circulation/circulation.ts` + `.spec.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `public/i18n/en.json`
- Follow DESIGN.md + ui-ux-pro-max: visible labels, loading on confirm, errors near field/toast, trackBy, ≥44px targets, reduced-motion safe transitions 150–200ms

- [ ] **Step 1: Failing component spec (member select, queue copy, confirm success/error, axe).**
- [ ] **Step 2: Implement page using ui-kit (`UiSearchInput` scan mode, `UiTable`, `UiButton`, `UiBadge`, `UiCard`, `UiEmptyState`).
- [ ] **Step 3: Commit.**

---

### Task 7: Verify + review

- [ ] **Step 1:** `CI=true pnpm test`
- [ ] **Step 2:** `pnpm test:sql:checkout` + concurrency
- [ ] **Step 3:** `pnpm build`
- [ ] **Step 4:** Code review via requesting-code-review; fix Critical/Important
- [ ] **Step 5:** Push + open/update PR against `feat/checkout`
