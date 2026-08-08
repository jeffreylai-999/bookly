import { Service, computed, inject, linkedSignal, resource, signal } from '@angular/core';

import { AppSettingsService } from '../core/app-settings';
import { ResourceSettlement } from '../core/resource-settlement';
import { clampPage, isListEmpty } from '../ui';
import { FinesRepository } from './fines.repository';
import type {
  FineListItem,
  FineReceipt,
  FineStatusFilter,
  FineSummary,
  Payment,
  PaymentResult,
  VoidResult,
  WaiveResult,
} from './fines.types';

const PAGE_SIZE = 10;
const EMPTY_LIST: FinesListValue = { rows: [], total: 0 };

type FinesListValue = { rows: FineListItem[]; total: number };
type FinesListParams = {
  status: FineStatusFilter;
  page: number;
  pageSize: number;
  nonce: number;
};

@Service()
export class FinesStore {
  private readonly repo = inject(FinesRepository);
  private readonly appSettings = inject(AppSettingsService);

  private readonly pageState = signal(1);
  private readonly statusFilterState = signal<FineStatusFilter>('all');
  private readonly summaryState = signal<FineSummary | null>(null);
  private readonly summaryErrorState = signal<string | null>(null);
  private readonly selectedFineState = signal<FineListItem | null>(null);
  private readonly paymentsState = signal<Payment[]>([]);
  private readonly paymentsLoadingState = signal(false);
  private readonly paymentsErrorState = signal<string | null>(null);
  private readonly busyState = signal(false);
  private readonly receiptState = signal<FineReceipt | null>(null);
  private readonly query = signal<FinesListParams | undefined>(undefined);

  private readonly listResource = resource({
    params: () => this.query(),
    loader: async ({ params }) => {
      const result = await this.repo.list({
        page: params.page,
        pageSize: params.pageSize,
        status: params.status,
      });
      if (result.error) {
        throw new Error('load_failed');
      }
      return { rows: result.rows, total: result.total };
    },
  });

  private readonly list = linkedSignal<FinesListValue | undefined, FinesListValue>({
    source: () => (this.listResource.error() ? EMPTY_LIST : this.listResource.value()),
    computation: (next, previous) => next ?? previous?.value ?? EMPTY_LIST,
  });

  private readonly settlement = new ResourceSettlement(this.listResource.isLoading);

  readonly rows = computed(() => this.list().rows);
  readonly total = computed(() => this.list().total);
  readonly page = this.pageState.asReadonly();
  readonly pageSize = PAGE_SIZE;
  readonly statusFilter = this.statusFilterState.asReadonly();
  readonly loading = this.listResource.isLoading;
  readonly error = computed(() => (this.listResource.error() ? 'load_failed' : null));
  readonly currency = this.appSettings.currency;
  readonly summary = this.summaryState.asReadonly();
  readonly summaryError = this.summaryErrorState.asReadonly();
  readonly selectedFine = this.selectedFineState.asReadonly();
  readonly payments = this.paymentsState.asReadonly();
  readonly paymentsLoading = this.paymentsLoadingState.asReadonly();
  readonly paymentsError = this.paymentsErrorState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly receipt = this.receiptState.asReadonly();
  readonly empty = computed(() => isListEmpty(this.loading(), this.error(), this.total()));

  async init(): Promise<void> {
    await this.appSettings.load();
    await this.load();
    await this.loadSummary();
  }

  async load(): Promise<void> {
    await this.runQuery();
  }

  async loadSummary(): Promise<void> {
    const result = await this.repo.summary();
    this.summaryErrorState.set(result.error);
    if (result.row) {
      this.summaryState.set(result.row);
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

  async openDetails(fine: FineListItem): Promise<void> {
    this.selectedFineState.set(fine);
    this.paymentsState.set([]);
    this.paymentsErrorState.set(null);
    this.paymentsLoadingState.set(true);
    try {
      const { rows, error } = await this.repo.listPayments(fine.id);
      if (this.selectedFineState()?.id !== fine.id) return;
      if (error) {
        this.paymentsErrorState.set(error);
        return;
      }
      this.paymentsState.set(rows);
    } finally {
      if (this.selectedFineState()?.id === fine.id) {
        this.paymentsLoadingState.set(false);
      }
    }
  }

  closeDetails(): void {
    this.selectedFineState.set(null);
    this.paymentsState.set([]);
    this.paymentsLoadingState.set(false);
    this.paymentsErrorState.set(null);
  }

  clearReceipt(): void {
    this.receiptState.set(null);
  }

  async recordPayment(fineId: string, amount: number, method: string): Promise<PaymentResult> {
    this.busyState.set(true);
    try {
      const result = await this.repo.recordPayment(fineId, amount, method);
      if (result.ok) {
        this.receiptState.set(result.receipt);
        await this.afterMutation(result.receipt.fine);
      }
      return result;
    } finally {
      this.busyState.set(false);
    }
  }

  async waiveFine(fineId: string, reason: string): Promise<WaiveResult> {
    this.busyState.set(true);
    try {
      const result = await this.repo.waiveFine(fineId, reason);
      if (result.ok) {
        await this.afterMutation(result.fine);
      }
      return result;
    } finally {
      this.busyState.set(false);
    }
  }

  async voidPayment(paymentId: string, reason: string): Promise<VoidResult> {
    this.busyState.set(true);
    try {
      const result = await this.repo.voidPayment(paymentId, reason);
      if (result.ok) {
        await this.afterMutation(result.fine);
      }
      return result;
    } finally {
      this.busyState.set(false);
    }
  }

  /**
   * Money moved: the list and stat cards are stale, and an open detail view
   * must reflect the fine's new amount_paid/status. Reloads in place.
   */
  private async afterMutation(fine: {
    id: string;
    amount_paid: number;
    status: FineListItem['status'];
  }): Promise<void> {
    const selected = this.selectedFineState();
    if (selected?.id === fine.id) {
      this.selectedFineState.set({ ...selected, ...fine });
      await this.loadPayments(fine.id);
    }
    await this.load();
    await this.loadSummary();
  }

  private async loadPayments(fineId: string): Promise<void> {
    const { rows, error } = await this.repo.listPayments(fineId);
    if (this.selectedFineState()?.id !== fineId) return;
    if (error) {
      this.paymentsErrorState.set(error);
      return;
    }
    this.paymentsState.set(rows);
  }

  private async runQuery(): Promise<void> {
    const request = this.settlement.begin();
    this.query.set({
      status: this.statusFilterState(),
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
