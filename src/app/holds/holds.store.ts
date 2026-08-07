import {
  ApplicationRef,
  Service,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';

import { pageCount } from '../ui';
import { HoldsRepository } from './holds.repository';
import type { HoldListItem, HoldsError, HoldStatusFilter } from './holds.types';

const DEFAULT_PAGE_SIZE = 10;
const EMPTY_LIST: HoldsListValue = { rows: [], total: 0 };

type HoldsListValue = { rows: HoldListItem[]; total: number };
type HoldsListParams = {
  status: HoldStatusFilter;
  page: number;
  pageSize: number;
  /**
   * Monotonic per-query nonce. Every `runQuery` is therefore a distinct
   * request, which supersedes an in-flight load instead of dropping it —
   * `resource.reload()` is a documented no-op while the status is `loading`.
   */
  nonce: number;
};

@Service()
export class HoldsStore {
  private readonly repo = inject(HoldsRepository);
  private readonly appRef = inject(ApplicationRef);

  private readonly statusState = signal<HoldStatusFilter>('');
  private readonly pageState = signal(1);
  private readonly pageSizeState = signal(DEFAULT_PAGE_SIZE);
  private readonly busyIdState = signal<string | null>(null);
  /** `undefined` keeps the resource idle until the first imperative load. */
  private readonly query = signal<HoldsListParams | undefined>(undefined);
  private queryNonce = 0;

  private readonly listResource = resource({
    params: () => this.query(),
    loader: async ({ params }) => {
      const list = await this.repo.listHolds(params.status, {
        page: params.page,
        pageSize: params.pageSize,
      });
      if (list.error) {
        throw new Error('load_failed');
      }
      return { rows: list.rows, total: list.total };
    },
  });

  /**
   * Sticky list value so filter/page loads don't blank the table mid-flight:
   * a params change drops the resource's previous stream, so `value()` is
   * `undefined` while the next load runs. Reads `error()` first because
   * `value()` throws once the resource is in the error state.
   */
  private readonly list = linkedSignal<HoldsListValue | undefined, HoldsListValue>({
    source: () => (this.listResource.error() ? EMPTY_LIST : this.listResource.value()),
    computation: (next, previous) => next ?? previous?.value ?? EMPTY_LIST,
  });

  readonly rows = computed(() => this.list().rows);
  readonly total = computed(() => this.list().total);
  readonly status = this.statusState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = this.pageSizeState.asReadonly();
  readonly loading = this.listResource.isLoading;
  readonly error = computed(() => (this.listResource.error() ? 'load_failed' : null));
  readonly busyId = this.busyIdState.asReadonly();

  readonly hasActiveFilters = computed(() => this.statusState() !== '');

  /** True only for a successful empty result — not while loading or after a load error. */
  readonly isEmpty = computed(
    () => !this.loading() && this.error() === null && this.total() === 0,
  );

  /**
   * Ids of the waiting rows that head their title's queue within the loaded
   * page. Mark-ready is per-title and the RPC serves the head regardless, so
   * the button shows only where it means something.
   */
  readonly queueHeadIds = computed(() => {
    const best = new Map<string, number>();
    for (const row of this.rows()) {
      if (row.status !== 'waiting') continue;
      const current = best.get(row.title_id);
      if (current === undefined || row.queue_position < current) {
        best.set(row.title_id, row.queue_position);
      }
    }
    return new Set(
      this.rows()
        .filter(
          (row) => row.status === 'waiting' && best.get(row.title_id) === row.queue_position,
        )
        .map((row) => row.id),
    );
  });

  async load(): Promise<void> {
    await this.runQuery();
  }

  async applyStatus(status: HoldStatusFilter): Promise<void> {
    this.statusState.set(status);
    this.pageState.set(1);
    await this.runQuery();
  }

  async applyPage(page: number): Promise<void> {
    this.pageState.set(Math.max(1, page));
    await this.runQuery();
  }

  async clearFilters(): Promise<void> {
    this.statusState.set('');
    this.pageState.set(1);
    await this.runQuery();
  }

  async markReady(
    titleId: string,
    copyBarcode: string,
  ): Promise<{ ok: true } | { ok: false; error: HoldsError }> {
    this.busyIdState.set(titleId);
    try {
      const result = await this.repo.markReady(titleId, copyBarcode);
      if (!result.ok) {
        return result;
      }
      await this.load();
      return { ok: true };
    } finally {
      this.busyIdState.set(null);
    }
  }

  async cancelHold(
    holdId: string,
  ): Promise<{ ok: true } | { ok: false; error: HoldsError }> {
    this.busyIdState.set(holdId);
    try {
      const result = await this.repo.cancelHold(holdId);
      if (!result.ok) {
        return result;
      }
      await this.load();
      return { ok: true };
    } finally {
      this.busyIdState.set(null);
    }
  }

  /**
   * Thin bridge from Promise-based call sites onto `resource()`: publish the
   * current filter/page as a fresh request and wait for it to settle. The page
   * clamp runs after settlement so the loader stays pure.
   *
   * ponytail: settlement is detected with the app-wide `ApplicationRef.whenStable()`
   * rather than this resource's own status, so an unrelated long-lived
   * PendingTask elsewhere in the app delays every `load()` here. It is what
   * pumps change detection for the imperative `await store.load()` call sites.
   * Upgrade path: drop the `Promise` return from the read methods, let
   * components drive off `loading()`, and this bridge disappears entirely.
   */
  private async runQuery(): Promise<void> {
    this.query.set({
      status: this.statusState(),
      page: this.pageState(),
      pageSize: this.pageSizeState(),
      nonce: ++this.queryNonce,
    });
    await this.appRef.whenStable();

    if (this.error() != null) {
      return;
    }
    const total = this.total();
    const maxPage = pageCount(total, this.pageSizeState());
    if (total > 0 && this.pageState() > maxPage) {
      this.pageState.set(maxPage);
      await this.runQuery();
    }
  }
}
