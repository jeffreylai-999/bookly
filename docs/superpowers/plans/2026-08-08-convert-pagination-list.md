# Convert Paginated List Stores Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Audit, Catalog, Members, Fines, and Loans list reads to the
Holds-style `resource()` flow, with common empty-state and page-clamp behavior.

**Architecture:** Each store owns its query parameter type, `resource()` loader,
and sticky `linkedSignal` value because their repository calls and side reads
differ. `src/app/ui/pagination.ts` owns two pure shared policies: empty-state
calculation and page clamping. Imperative public APIs keep returning `Promise`
where they do today, using `ApplicationRef.whenStable()` to bridge them to
resource settlement.

**Tech Stack:** Angular 22 signals and `resource()`, TypeScript, Vitest, pnpm.

## Global Constraints

- Preserve existing public store APIs and each store's filters, pagination, side
  reads, and mutation behavior.
- Do not touch Settings, Circulation check-in, or command busy flags.
- Remove `loadGeneration` from all five converted stores.
- Do not add dependencies or a generic store factory.
- Do not commit: the user explicitly requested uncommitted changes.

---

## File Structure

- Modify `src/app/ui/pagination.ts` and its barrel export remains unchanged:
  pure pagination policies shared by all list stores.
- Modify the five `*.store.ts` files: local resource query and sticky result
  mechanics; no store-specific repository logic moves into a shared factory.
- Modify the five colocated specs: preserve filter/paging assertions and add
  resource supersession or clamp coverage.

### Task 1: Add pure list-state policies

**Files:**
- Modify: `src/app/ui/pagination.ts:4-15`
- Create: `src/app/ui/pagination.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export function isListEmpty(
    loading: boolean,
    error: string | null,
    total: number,
    isValid = true,
  ): boolean;

  export function clampPage(page: number, total: number, pageSize: number): number;
  ```

- [ ] **Step 1: Write failing tests**

  ```ts
  import { clampPage, isListEmpty } from './pagination';

  describe('isListEmpty', () => {
    it('only reports a successful, valid zero-total list as empty', () => {
      expect(isListEmpty(false, null, 0)).toBe(true);
      expect(isListEmpty(true, null, 0)).toBe(false);
      expect(isListEmpty(false, 'load_failed', 0)).toBe(false);
      expect(isListEmpty(false, null, 0, false)).toBe(false);
    });
  });

  describe('clampPage', () => {
    it('moves a populated out-of-range page to the last page', () => {
      expect(clampPage(3, 11, 10)).toBe(2);
    });

    it('keeps the selected page when the result has no rows', () => {
      expect(clampPage(3, 0, 10)).toBe(3);
    });
  });
  ```

- [ ] **Step 2: Run the focused test and verify it fails**

  Run: `pnpm exec ng test --watch=false --include=src/app/ui/pagination.spec.ts`

  Expected: compilation failure because `isListEmpty` and `clampPage` are not
  exported.

- [ ] **Step 3: Implement the minimal pure helpers**

  ```ts
  export function isListEmpty(
    loading: boolean,
    error: string | null,
    total: number,
    isValid = true,
  ): boolean {
    return !loading && error === null && isValid && total === 0;
  }

  export function clampPage(page: number, total: number, pageSize: number): number {
    return total > 0 ? Math.min(page, pageCount(total, pageSize)) : page;
  }
  ```

- [ ] **Step 4: Run the focused test and verify it passes**

  Run: `pnpm exec ng test --watch=false --include=src/app/ui/pagination.spec.ts`

  Expected: all pagination policy specs pass.

### Task 2: Convert Audit and Catalog reads

**Files:**
- Modify: `src/app/audit/audit.store.ts:1-170`
- Modify: `src/app/audit/audit.store.spec.ts`
- Modify: `src/app/catalog/catalog.store.ts:1-159`
- Modify: `src/app/catalog/catalog.store.spec.ts`

**Interfaces:**
- Audit retains `init`, `load`, all `set*` methods, `empty`, and `actorsError`.
- Catalog retains `load`, `applySearch`, `applyGenre`, `applyPage`, mutations,
  and `isEmpty`.
- Both replace manual result signals and `loadGeneration` with a local
  `resource()` plus a `linkedSignal`.

- [ ] **Step 1: Add failing behavior tests**

  Add one Audit test that loads page 2 with `{ rows: [sampleRow], total: 1,
  error: null }` then asserts the final query and state are page 1. Add one
  Catalog test using a deferred `listTitles` result for `"slow"`, then an
  immediate empty-search result, and assert the immediate result remains after
  resolving the stale request.

  ```ts
  await store.setPage(2);
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));

  const slow = store.applySearch('slow');
  await store.applySearch('');
  deferred.resolve({ rows: [], total: 0 });
  await slow;
  expect(store.rows()).toEqual([dune]);
  ```

- [ ] **Step 2: Run their focused specs and verify the Audit clamp fails**

  Run: `pnpm exec ng test --watch=false --include=src/app/audit/audit.store.spec.ts --include=src/app/catalog/catalog.store.spec.ts`

  Expected: Audit's clamp assertion fails because the current implementation
  derives `maxPage` before publishing the first page's rows; the test documents
  the resource-settlement behavior to preserve after the conversion.

- [ ] **Step 3: Replace each manual read state with resource state**

  For Audit, import `ApplicationRef`, `linkedSignal`, and `resource`; define
  `AuditListValue` and `AuditListParams` with actor/action/entity/date/page and
  nonce; the loader returns `{ rows, total }` or throws `new Error('load_failed')`.
  Keep the invalid-date branch in `runQuery()` by clearing its sticky list and
  not publishing a repository request. `empty` becomes:

  ```ts
  readonly empty = computed(() =>
    isListEmpty(this.loading(), this.error(), this.total(), !this.dateRangeInvalid()),
  );
  ```

  For Catalog, query params are search, genre, page, pageSize, and nonce. The
  loader uses `Promise.all` for `listTitles` and `listGenres` and returns
  `{ rows: list.rows, total: list.total, genres }`. Its sticky value preserves
  rows, total, and genres. `isEmpty` becomes:

  ```ts
  readonly isEmpty = computed(() =>
    isListEmpty(this.loading(), this.error(), this.total()),
  );
  ```

  In both stores, `runQuery()` publishes a fresh nonce, awaits
  `this.appRef.whenStable()`, returns on an error, calls
  `clampPage(this.pageState(), this.total(), pageSize)`, and recursively reloads
  only when the returned page differs from `pageState()`.

- [ ] **Step 4: Run their focused specs and verify they pass**

  Run: `pnpm exec ng test --watch=false --include=src/app/audit/audit.store.spec.ts --include=src/app/catalog/catalog.store.spec.ts`

  Expected: all Audit and Catalog store specs pass.

### Task 3: Convert Members and Fines reads

**Files:**
- Modify: `src/app/members/members.store.ts:1-186`
- Modify: `src/app/members/members.store.spec.ts`
- Modify: `src/app/fines/fines.store.ts:1-210`
- Modify: `src/app/fines/fines.store.spec.ts`

**Interfaces:**
- Members retains fire-and-forget filter setters, member-type loading, audit,
  and save state.
- Fines retains settings load, summary/payment reads, receipt, and busy state.
- Both acquire clamping for populated out-of-range pages.

- [ ] **Step 1: Add failing page-clamp tests**

  In each spec, mock the first list call at page 2 as `{ rows: [], total: 1,
  error: null }`, then the reloaded page 1 as a single row. Call `setPage(2)`
  (Members) or `await setPage(2)` (Fines) and assert the final repository call
  includes page 1 and the store exposes the second result.

  ```ts
  expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
  expect(store.total()).toBe(1);
  ```

- [ ] **Step 2: Run their focused specs and verify they fail**

  Run: `pnpm exec ng test --watch=false --include=src/app/members/members.store.spec.ts --include=src/app/fines/fines.store.spec.ts`

  Expected: both new clamp tests fail because neither store currently reloads
  a page made invalid by a smaller total.

- [ ] **Step 3: Convert the two list reads**

  Give Members a `{ rows: MemberListItem[]; total: number }` resource value and
  params `{ nameSearch, status, page, pageSize, nonce }`; keep
  `loadMemberTypes()` unchanged. Give Fines a `{ rows: FineListItem[]; total:
  number }` resource value and params `{ status, page, pageSize, nonce }`; keep
  `loadSummary`, `openDetails`, `loadPayments`, and mutations unchanged.

  In both, replace manual `rowsState`, `totalState`, `loadingState`,
  `errorState`, and `loadGeneration` list behavior with:

  ```ts
  readonly rows = computed(() => this.list().rows);
  readonly total = computed(() => this.list().total);
  readonly loading = this.listResource.isLoading;
  readonly error = computed(() => (this.listResource.error() ? 'load_failed' : null));
  readonly empty = computed(() => isListEmpty(this.loading(), this.error(), this.total()));
  ```

  `runQuery()` follows Task 2's nonce/settlement/clamp sequence. Member save
  methods continue checking `this.error()` after awaiting `load()`.

- [ ] **Step 4: Run their focused specs and verify they pass**

  Run: `pnpm exec ng test --watch=false --include=src/app/members/members.store.spec.ts --include=src/app/fines/fines.store.spec.ts`

  Expected: all Members and Fines specs pass.

### Task 4: Convert Loans reads

**Files:**
- Modify: `src/app/circulation/loans.store.ts:1-114`
- Modify: `src/app/circulation/loans.store.spec.ts`

**Interfaces:**
- Retains `loans`, `overdue`, `tab`, `renewingId`, `renew`, and page/tab APIs.
- Resource params are `{ tab, page, pageSize, nonce }`.

- [ ] **Step 1: Add a failing clamp test**

  Mock `listLoans` to return page 2 `{ rows: [], total: 1, error: null }` and
  page 1 `{ rows: [loanRow], total: 1, error: null }`; call `await
  store.setPage(2)` and assert the final call is:

  ```ts
  expect(listLoans).toHaveBeenLastCalledWith('active', { page: 1, pageSize: 10 });
  expect(store.loans()).toEqual([loanRow]);
  ```

- [ ] **Step 2: Run the focused spec and verify it fails**

  Run: `pnpm exec ng test --watch=false --include=src/app/circulation/loans.store.spec.ts`

  Expected: the clamp assertion fails because `LoansStore.load()` does not
  currently inspect the result's last valid page.

- [ ] **Step 3: Convert the tab-specific list resource**

  Use a discriminated value:

  ```ts
  type LoansListValue =
    | { tab: 'overdue'; loans: []; overdue: OverdueLoan[]; total: number }
    | { tab: Exclude<LoansTab, 'overdue'>; loans: LoanListItem[]; overdue: []; total: number };
  ```

  Its loader switches on `params.tab`; the `default` clause declares a `never`
  variable before throwing to keep the union exhaustive. The list's linked
  value exposes derived `loans`, `overdue`, and `total`; errors map to
  `'load_failed'`; `empty` delegates to `isListEmpty`. `runQuery()` publishes
  nonce params, awaits stability, and recursively requests the shared
  `clampPage` result. Keep `renew()` and its `renewingId` guard unchanged.

- [ ] **Step 4: Run the focused spec and verify it passes**

  Run: `pnpm exec ng test --watch=false --include=src/app/circulation/loans.store.spec.ts`

  Expected: all Loans specs pass.

### Task 5: Verify the complete change

**Files:**
- Modify only the files in Tasks 1-4 and this plan/design documentation.

- [ ] **Step 1: Confirm manual staleness scaffolding is absent**

  Run: `rg "loadGeneration" src/app/audit src/app/catalog src/app/members src/app/fines src/app/circulation/loans.store.ts`

  Expected: no matches.

- [ ] **Step 2: Run the complete test suite**

  Run: `CI=true pnpm test`

  Expected: zero failing specs.

- [ ] **Step 3: Build the production application**

  Run: `pnpm build`

  Expected: exit code 0.

- [ ] **Step 4: Review the final diff**

  Run: `git diff --check; git diff --stat; git status --short`

  Expected: no whitespace errors; only the planned source, spec, and
  documentation files are modified or added.

- [ ] **Step 5: Keep the changes uncommitted**

  Do not run `git add` or `git commit`.
