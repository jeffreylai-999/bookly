import { Service, computed, inject, signal } from '@angular/core';

import { pageCount } from '../ui';
import { HoldsRepository } from './holds.repository';
import type { HoldListItem, HoldsError, HoldStatusFilter } from './holds.types';

const DEFAULT_PAGE_SIZE = 10;

@Service()
export class HoldsStore {
  private readonly repo = inject(HoldsRepository);
  /** Bumped on each load so stale responses cannot overwrite newer results. */
  private loadGeneration = 0;

  private readonly rowsState = signal<HoldListItem[]>([]);
  private readonly totalState = signal(0);
  private readonly statusState = signal<HoldStatusFilter>('');
  private readonly pageState = signal(1);
  private readonly pageSizeState = signal(DEFAULT_PAGE_SIZE);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly busyIdState = signal<string | null>(null);

  readonly rows = this.rowsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly status = this.statusState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = this.pageSizeState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly busyId = this.busyIdState.asReadonly();

  readonly hasActiveFilters = computed(() => this.statusState() !== '');

  /** True only for a successful empty result — not while loading or after a load error. */
  readonly isEmpty = computed(
    () => !this.loadingState() && this.errorState() === null && this.totalState() === 0,
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

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const page = this.pageState();
      const pageSize = this.pageSizeState();
      const list = await this.repo.listHolds(this.statusState(), { page, pageSize });
      if (generation !== this.loadGeneration) {
        return;
      }
      if (list.error) {
        this.errorState.set('load_failed');
        this.rowsState.set([]);
        this.totalState.set(0);
        return;
      }

      const maxPage = pageCount(list.total, pageSize);
      if (list.total > 0 && page > maxPage) {
        this.pageState.set(maxPage);
        await this.load();
        return;
      }

      this.rowsState.set(list.rows);
      this.totalState.set(list.total);
    } catch {
      if (generation !== this.loadGeneration) {
        return;
      }
      this.errorState.set('load_failed');
      this.rowsState.set([]);
      this.totalState.set(0);
    } finally {
      if (generation === this.loadGeneration) {
        this.loadingState.set(false);
      }
    }
  }

  async applyStatus(status: HoldStatusFilter): Promise<void> {
    this.statusState.set(status);
    this.pageState.set(1);
    await this.load();
  }

  async applyPage(page: number): Promise<void> {
    this.pageState.set(Math.max(1, page));
    await this.load();
  }

  async clearFilters(): Promise<void> {
    this.statusState.set('');
    this.pageState.set(1);
    await this.load();
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
}
