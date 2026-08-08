# Convert Fan-Out Stores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace manual asynchronous read state in Overview, Member detail, and Reports with Angular `resource()` while preserving independent dataset states.

**Architecture:** Each screen publishes its imperative input through a signal and owns one `resource()` per dataset. Resources throw normalized load errors; public computed signals expose data, error, and loading without hand-rolled generation guards. Reports repository methods return one metric each so one rejected RPC does not hide the others.

**Tech Stack:** Angular 22 signals and `resource()`, TypeScript, Vitest.

## Global Constraints

- New async reads use Angular `resource()`, not a hand-rolled loading/error/generation triple.
- Keep each dataset's loading and error state independent; an errored stat must not render as zero.
- Reuse framework cancellation for superseded member and range reads.
- Preserve the existing public store API where components rely on it.
- Write a focused failing test before production code and run it before and after the change.
- Do not create a Git commit; the user explicitly requested uncommitted changes.

---

### Task 1: Convert Overview reads

**Files:**
- Modify: `src/app/overview/overview.store.ts`
- Modify: `src/app/overview/overview.store.spec.ts`

**Interfaces:**
- Consumes: existing Overview repository result shapes.
- Produces: existing public Overview signals derived from seven `resource()` instances.

- [ ] **Step 1: Write failing tests** asserting resource-backed overview initialization still exposes all section results, each resource exposes an independent error, and the aggregate loading state remains true until all initial reads settle.
- [ ] **Step 2: Run the overview store spec** with `pnpm exec ng test --watch=false --include='src/app/overview/overview.store.spec.ts'`; confirm the new resource assertions fail before the conversion.
- [ ] **Step 3: Replace the seven private loader methods and their manual state signals** with seven `resource()` values driven by an initialization nonce. Derive public data/error/loading signals with `computed()`, keeping the overdue rows and total coupled to one resource.
- [ ] **Step 4: Run the overview store spec again** and confirm it passes.

### Task 2: Convert Member detail reads

**Files:**
- Modify: `src/app/members/member-detail.store.ts`
- Modify: `src/app/members/member-detail.store.spec.ts`

**Interfaces:**
- Consumes: member id passed to `init()` and existing repository result shapes.
- Produces: existing public member, panel, error, and loading signals backed by resources.

- [ ] **Step 1: Write failing tests** covering navigation while a prior member request is pending and independent member/panel errors from resources.
- [ ] **Step 2: Run the member-detail store spec** with `pnpm exec ng test --watch=false --include='src/app/members/member-detail.store.spec.ts'`; confirm the resource-specific assertions fail before the conversion.
- [ ] **Step 3: Replace `memberIdState` stale-result checks and five loader methods** with resources parameterized by the current member id. Keep synchronous panel clearing on navigation, not-found handling, and mutation-triggered refreshes.
- [ ] **Step 4: Run the member-detail store spec again** and confirm it passes.

### Task 3: Split and convert Reports metrics

**Files:**
- Modify: `src/app/reports/reports.repository.ts`
- Modify: `src/app/reports/reports.repository.spec.ts`
- Modify: `src/app/reports/reports.store.ts`
- Modify: `src/app/reports/reports.store.spec.ts`
- Modify: `src/app/reports/reports.ts`
- Modify: `src/app/reports/reports.spec.ts`

**Interfaces:**
- Consumes: `RangeDays` and the existing seven report RPCs.
- Produces: one typed repository method and one resource per metric; public metric data, errors, and loading states remain independently readable.

- [ ] **Step 1: Write failing repository and store tests** showing a failed metric leaves successful metrics visible, and a superseded range ignores earlier results.
- [ ] **Step 2: Run the two Reports specs** with `pnpm exec ng test --watch=false --include='src/app/reports/reports.{store,repository}.spec.ts'`; confirm the new tests fail before implementation.
- [ ] **Step 3: Replace `loadAll()` with typed per-metric methods** and replace the aggregate `loadGeneration`, loading, error, and metric state with range-parameterized resources. Expose aggregate `loading` only as a derived compatibility signal and per-metric error/loading signals for rendering.
- [ ] **Step 4: Render each report card's own load failure** with the existing translated load-failed copy, keeping successful report cards visible and preventing an errored metric from rendering as empty/zero data. Add component coverage for one failed metric alongside a successful metric.
- [ ] **Step 5: Run the Reports specs again** and confirm they pass.

### Task 4: Document and validate the read shape

**Files:**
- Modify: `docs/angular-style.md`

- [ ] **Step 1: Add the async-read rule** under State Management: “Use `resource()` for new async reads; do not hand-roll loading/error/generation state.”
- [ ] **Step 2: Run focused suites** for Overview, Member detail, and Reports.
- [ ] **Step 3: Run `pnpm test` and `pnpm build`** and inspect their complete output for failures.
