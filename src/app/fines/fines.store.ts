import { Service, computed, inject, signal } from '@angular/core';

import { FinesRepository } from './fines.repository';
import type { FineListItem, FineStatusFilter } from './fines.types';

const PAGE_SIZE = 10;

@Service()
export class FinesStore {
  private readonly repo = inject(FinesRepository);
  /** Bumped on each load so superseded filter/page responses are ignored. */
  private loadGeneration = 0;

  private readonly rowsState = signal<FineListItem[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly statusFilterState = signal<FineStatusFilter>('all');
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly currencyState = signal('USD');

  readonly rows = this.rowsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = PAGE_SIZE;
  readonly statusFilter = this.statusFilterState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly currency = this.currencyState.asReadonly();
  readonly empty = computed(
    () => !this.loadingState() && !this.errorState() && this.totalState() === 0,
  );

  async init(): Promise<void> {
    const currency = await this.repo.getCurrency();
    if (!currency.error) {
      this.currencyState.set(currency.currency);
    }
    await this.load();
  }

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const result = await this.repo.list({
        page: this.pageState(),
        pageSize: PAGE_SIZE,
        status: this.statusFilterState(),
      });
      if (generation !== this.loadGeneration) return;
      if (result.error) {
        this.errorState.set(result.error);
        this.rowsState.set([]);
        this.totalState.set(0);
        return;
      }
      this.rowsState.set(result.rows);
      this.totalState.set(result.total);
    } finally {
      if (generation === this.loadGeneration) {
        this.loadingState.set(false);
      }
    }
  }

  async setStatusFilter(status: FineStatusFilter): Promise<void> {
    if (status === this.statusFilterState()) return;
    this.statusFilterState.set(status);
    this.pageState.set(1);
    await this.load();
  }

  async setPage(page: number): Promise<void> {
    this.pageState.set(page);
    await this.load();
  }
}
