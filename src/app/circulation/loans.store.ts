import { Service, computed, inject, signal } from '@angular/core';

import { CirculationRepository } from './circulation.repository';
import type { LoanListItem, LoansTab, OverdueLoan } from './circulation.types';

const PAGE_SIZE = 10;

@Service()
export class LoansStore {
  private readonly repo = inject(CirculationRepository);
  /** Bumped on each load so superseded tab/page responses are ignored. */
  private loadGeneration = 0;

  private readonly tabState = signal<LoansTab>('active');
  private readonly loansState = signal<LoanListItem[]>([]);
  private readonly overdueState = signal<OverdueLoan[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly tab = this.tabState.asReadonly();
  readonly loans = this.loansState.asReadonly();
  readonly overdue = this.overdueState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = PAGE_SIZE;
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly empty = computed(
    () => !this.loadingState() && !this.errorState() && this.totalState() === 0,
  );

  async init(): Promise<void> {
    await this.load();
  }

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const tab = this.tabState();
      const query = { page: this.pageState(), pageSize: PAGE_SIZE };

      if (tab === 'overdue') {
        const result = await this.repo.listOverdue(query);
        if (generation !== this.loadGeneration) return;
        if (result.error) {
          this.errorState.set(result.error);
          this.overdueState.set([]);
          this.totalState.set(0);
          return;
        }
        this.overdueState.set(result.rows);
        this.totalState.set(result.total);
      } else {
        const result = await this.repo.listLoans(tab, query);
        if (generation !== this.loadGeneration) return;
        if (result.error) {
          this.errorState.set(result.error);
          this.loansState.set([]);
          this.totalState.set(0);
          return;
        }
        this.loansState.set(result.rows);
        this.totalState.set(result.total);
      }
    } finally {
      if (generation === this.loadGeneration) {
        this.loadingState.set(false);
      }
    }
  }

  async setTab(tab: LoansTab): Promise<void> {
    if (tab === this.tabState()) return;
    this.tabState.set(tab);
    this.pageState.set(1);
    await this.load();
  }

  async setPage(page: number): Promise<void> {
    this.pageState.set(page);
    await this.load();
  }
}
