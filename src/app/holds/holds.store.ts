import {
  ApplicationRef,
  Service,
  computed,
  effect,
  inject,
  resource,
  signal,
} from '@angular/core';

import { pageCount } from '../ui';
import { HoldsRepository } from './holds.repository';
import type { HoldListItem, HoldsError, HoldStatusFilter } from './holds.types';

const DEFAULT_PAGE_SIZE = 10;

type HoldsListValue = { rows: HoldListItem[]; total: number };
type HoldsListParams = {
  status: HoldStatusFilter;
  page: number;
  pageSize: number;
};

@Service()
export class HoldsStore {
  private readonly repo = inject(HoldsRepository);
  private readonly appRef = inject(ApplicationRef);

  private readonly statusState = signal<HoldStatusFilter>('');
  private readonly pageState = signal(1);
  private readonly pageSizeState = signal(DEFAULT_PAGE_SIZE);
  private readonly busyIdState = signal<string | null>(null);
  /** Sticky list value so filter/page loads don't blank the table mid-flight. */
  private readonly rowsState = signal<HoldListItem[]>([]);
  private readonly totalState = signal(0);
  /** `undefined` keeps the resource idle until the first imperative load. */
  private readonly query = signal<HoldsListParams | undefined>(undefined);

  private readonly listResource = resource({
    params: () => this.query(),
    loader: async ({ params, abortSignal }): Promise<HoldsListValue> => {
      const list = await this.repo.listHolds(params.status, {
        page: params.page,
        pageSize: params.pageSize,
      });
      if (abortSignal.aborted) {
        throw new DOMException('The operation was aborted.', 'AbortError');
      }
      if (list.error) {
        throw new Error('load_failed');
      }
      return { rows: list.rows, total: list.total };
    },
  });

  readonly rows = this.rowsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = this.pageSizeState.asReadonly();
  readonly loading = this.listResource.isLoading;
  readonly error = computed(() => {
    const err = this.listResource.error();
    if (err == null || err.name === 'AbortError') return null;
    return 'load_failed';
  });
  readonly busyId = this.busyIdState.asReadonly();

  readonly hasActiveFilters = computed(() => this.statusState() !== '');

  /** True only for a successful empty result — not while loading or after a load error. */
  readonly isEmpty = computed(
    () => !this.loading() && this.error() === null && this.totalState() === 0,
  );

  /**
   * Ids of the waiting rows that head their title's queue within the loaded
   * page. Mark-ready is per-title and the RPC serves the head regardless, so
   * the button shows only where it means something.
   */
  readonly queueHeadIds = computed(() => {
    const best = new Map<string, number>();
    for (const row of this.rowsState()) {
      if (row.status !== 'waiting') continue;
      const current = best.get(row.title_id);
      if (current === undefined || row.queue_position < current) {
        best.set(row.title_id, row.queue_position);
      }
    }
    return new Set(
      this.rowsState()
        .filter(
          (row) => row.status === 'waiting' && best.get(row.title_id) === row.queue_position,
        )
        .map((row) => row.id),
    );
  });

  constructor() {
    effect(() => {
      const err = this.listResource.error();
      if (err != null) {
        // Aborted loaders must not wipe the sticky list or surface as failures.
        if (err.name === 'AbortError') return;
        this.rowsState.set([]);
        this.totalState.set(0);
        return;
      }
      const value = this.listResource.value();
      if (value) {
        this.rowsState.set(value.rows);
        this.totalState.set(value.total);
      }
    });
  }

  async load(): Promise<void> {
    await this.runQuery(this.currentParams());
  }

  async applyStatus(status: HoldStatusFilter): Promise<void> {
    this.statusState.set(status);
    this.pageState.set(1);
    await this.runQuery(this.currentParams());
  }

  async applyPage(page: number): Promise<void> {
    this.pageState.set(Math.max(1, page));
    await this.runQuery(this.currentParams());
  }

  async clearFilters(): Promise<void> {
    this.statusState.set('');
    this.pageState.set(1);
    await this.runQuery(this.currentParams());
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

  private currentParams(): HoldsListParams {
    return {
      status: this.statusState(),
      page: this.pageState(),
      pageSize: this.pageSizeState(),
    };
  }

  /**
   * Thin bridge from Promise-based call sites onto `resource()`: publish params
   * (or reload when they are unchanged) and wait for PendingTasks to drain.
   * Page clamp runs after settlement so the loader stays pure.
   */
  private async runQuery(params: HoldsListParams): Promise<void> {
    const current = this.query();
    if (
      current &&
      current.status === params.status &&
      current.page === params.page &&
      current.pageSize === params.pageSize
    ) {
      this.listResource.reload();
    } else {
      this.query.set(params);
    }
    await this.appRef.whenStable();

    if (this.error() != null) {
      return;
    }
    const total = this.totalState();
    const pageSize = this.pageSizeState();
    const maxPage = pageCount(total, pageSize);
    if (total > 0 && this.pageState() > maxPage) {
      this.pageState.set(maxPage);
      await this.runQuery(this.currentParams());
    }
  }
}
