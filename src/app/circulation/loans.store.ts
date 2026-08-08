import { Service, computed, inject, linkedSignal, resource, signal } from '@angular/core';

import { AppSettingsService } from '../core/app-settings';
import { ResourceSettlement } from '../core/resource-settlement';
import { clampPage, isListEmpty } from '../ui';
import { CirculationRepository } from './circulation.repository';
import type { LoanListItem, LoansTab, OverdueLoan, RenewResult } from './circulation.types';

const PAGE_SIZE = 10;
const EMPTY_LIST: LoansListValue = {
  tab: 'active',
  loans: [],
  overdue: [],
  total: 0,
};

type LoansListValue =
  | { tab: 'overdue'; loans: []; overdue: OverdueLoan[]; total: number }
  | {
      tab: Exclude<LoansTab, 'overdue'>;
      loans: LoanListItem[];
      overdue: [];
      total: number;
    };
type LoansListParams = {
  tab: LoansTab;
  page: number;
  pageSize: number;
  nonce: number;
};

@Service()
export class LoansStore {
  private readonly repo = inject(CirculationRepository);
  private readonly appSettings = inject(AppSettingsService);

  private readonly tabState = signal<LoansTab>('active');
  private readonly pageState = signal(1);
  /** Loan id with a renew in flight; null when idle. */
  private readonly renewingIdState = signal<string | null>(null);
  private readonly query = signal<LoansListParams | undefined>(undefined);

  private readonly listResource = resource({
    params: () => this.query(),
    loader: async ({ params }) => {
      const query = { page: params.page, pageSize: params.pageSize };
      switch (params.tab) {
        case 'overdue': {
          const result = await this.repo.listOverdue(query);
          if (result.error) {
            throw new Error('load_failed');
          }
          return {
            tab: params.tab,
            loans: [],
            overdue: result.rows,
            total: result.total,
          } satisfies LoansListValue;
        }
        case 'active':
        case 'returned': {
          const result = await this.repo.listLoans(params.tab, query);
          if (result.error) {
            throw new Error('load_failed');
          }
          return {
            tab: params.tab,
            loans: result.rows,
            overdue: [],
            total: result.total,
          } satisfies LoansListValue;
        }
        default: {
          const exhaustive: never = params.tab;
          throw new Error(`unsupported_tab:${exhaustive}`);
        }
      }
    },
  });

  private readonly list = linkedSignal<LoansListValue | undefined, LoansListValue>({
    source: () => (this.listResource.error() ? EMPTY_LIST : this.listResource.value()),
    computation: (next, previous) => next ?? previous?.value ?? EMPTY_LIST,
  });

  private readonly settlement = new ResourceSettlement(this.listResource.isLoading);

  readonly tab = this.tabState.asReadonly();
  readonly loans = computed(() => this.list().loans);
  readonly overdue = computed(() => this.list().overdue);
  readonly total = computed(() => this.list().total);
  readonly page = this.pageState.asReadonly();
  readonly pageSize = PAGE_SIZE;
  readonly loading = this.listResource.isLoading;
  readonly error = computed(() => (this.listResource.error() ? 'load_failed' : null));
  readonly currency = this.appSettings.currency;
  readonly renewingId = this.renewingIdState.asReadonly();
  readonly empty = computed(() => isListEmpty(this.loading(), this.error(), this.total()));

  async init(): Promise<void> {
    await this.appSettings.load();
    await this.load();
  }

  async load(): Promise<void> {
    await this.runQuery();
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

  async renew(loan: LoanListItem): Promise<RenewResult> {
    if (this.renewingIdState() !== null) return { ok: false, error: 'unexpected' };

    this.renewingIdState.set(loan.id);
    try {
      const result = await this.repo.renew(loan.id);
      // A renewed loan sorts by its new due date; reload rather than patch the
      // row in place so the active tab's ordering stays honest.
      if (result.ok) await this.load();
      return result;
    } finally {
      this.renewingIdState.set(null);
    }
  }

  private async runQuery(): Promise<void> {
    const request = this.settlement.begin();
    this.query.set({
      tab: this.tabState(),
      page: this.pageState(),
      pageSize: PAGE_SIZE,
      nonce: request.nonce,
    });
    await request.wait();
    if (!request.isCurrent()) return;

    if (this.error() != null) {
      return;
    }
    const page = clampPage(this.pageState(), this.total(), PAGE_SIZE);
    if (page !== this.pageState()) {
      this.pageState.set(page);
      await this.runQuery();
    }
  }
}
