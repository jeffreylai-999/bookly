import { Service, computed, inject, signal } from '@angular/core';

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
  private readonly summaryState = signal<FineSummary | null>(null);
  private readonly summaryErrorState = signal<string | null>(null);
  private readonly selectedFineState = signal<FineListItem | null>(null);
  private readonly paymentsState = signal<Payment[]>([]);
  private readonly paymentsLoadingState = signal(false);
  private readonly busyState = signal(false);
  private readonly receiptState = signal<FineReceipt | null>(null);

  readonly rows = this.rowsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = PAGE_SIZE;
  readonly statusFilter = this.statusFilterState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly currency = this.currencyState.asReadonly();
  readonly summary = this.summaryState.asReadonly();
  readonly summaryError = this.summaryErrorState.asReadonly();
  readonly selectedFine = this.selectedFineState.asReadonly();
  readonly payments = this.paymentsState.asReadonly();
  readonly paymentsLoading = this.paymentsLoadingState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly receipt = this.receiptState.asReadonly();
  readonly empty = computed(
    () => !this.loadingState() && !this.errorState() && this.totalState() === 0,
  );

  async init(): Promise<void> {
    const currency = await this.repo.getCurrency();
    if (!currency.error) {
      this.currencyState.set(currency.currency);
    }
    await this.load();
    await this.loadSummary();
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
    this.paymentsLoadingState.set(true);
    try {
      const { rows } = await this.repo.listPayments(fine.id);
      if (this.selectedFineState()?.id !== fine.id) return;
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
    const { rows } = await this.repo.listPayments(fineId);
    if (this.selectedFineState()?.id === fineId) {
      this.paymentsState.set(rows);
    }
  }
}
