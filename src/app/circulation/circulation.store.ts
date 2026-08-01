import { Service, computed, inject, signal } from '@angular/core';

import { CirculationRepository, type MemberMoney } from './circulation.repository';
import type {
  CheckoutCopy,
  CheckoutError,
  CheckoutMember,
  CopyStatus,
} from './circulation.types';

function copyStatusToError(status: CopyStatus): CheckoutError | null {
  switch (status) {
    case 'available':
      return null;
    case 'on_loan':
      return 'copy_on_loan';
    case 'on_hold_shelf':
      return null;
    case 'lost':
      return 'copy_lost';
    case 'damaged':
      return 'copy_damaged';
    case 'retired':
      return 'copy_retired';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

@Service()
export class CirculationStore {
  private readonly repo = inject(CirculationRepository);

  private readonly memberState = signal<CheckoutMember | null>(null);
  private readonly queuedState = signal<CheckoutCopy[]>([]);
  private readonly busyState = signal(false);
  private readonly lastDueAtState = signal<string | null>(null);
  private readonly moneyState = signal<MemberMoney | null>(null);
  private readonly currencyState = signal('USD');
  /** Bumped per member switch so a stale money response can't land. */
  private moneyGeneration = 0;
  private settingsLoaded = false;

  readonly member = this.memberState.asReadonly();
  readonly queuedCopies = this.queuedState.asReadonly();
  readonly busy = this.busyState.asReadonly();
  readonly lastDueAt = this.lastDueAtState.asReadonly();
  readonly money = this.moneyState.asReadonly();
  readonly currency = this.currencyState.asReadonly();

  readonly canConfirm = computed(
    () =>
      this.memberState()?.status === 'active' &&
      this.queuedState().length > 0 &&
      !this.busyState(),
  );

  setMember(member: CheckoutMember | null): void {
    this.memberState.set(member);
    this.lastDueAtState.set(null);
    this.loadMoney(member?.id ?? null);
  }

  async selectMemberByCard(
    cardBarcode: string,
  ): Promise<{ error: CheckoutError | 'lookup_failed' | null }> {
    this.busyState.set(true);
    try {
      const { row, error } = await this.repo.findMemberByCard(cardBarcode);
      if (error) return { error: 'lookup_failed' };
      if (!row) return { error: 'member_not_found' };
      this.memberState.set(row);
      this.queuedState.set([]);
      this.lastDueAtState.set(null);
      this.loadMoney(row.id);
      return { error: null };
    } finally {
      this.busyState.set(false);
    }
  }

  async queueCopyByBarcode(
    barcode: string,
  ): Promise<{ error: CheckoutError | 'lookup_failed' | null }> {
    const code = barcode.trim();
    if (!code) return { error: 'copy_not_found' };

    if (this.queuedState().some((c) => c.barcode === code)) {
      return { error: 'duplicate_barcode' };
    }

    this.busyState.set(true);
    try {
      const { row, error } = await this.repo.findCopyByBarcode(code);
      if (error) return { error: 'lookup_failed' };
      if (!row) return { error: 'copy_not_found' };

      const statusError = copyStatusToError(row.status);
      if (statusError) return { error: statusError };

      this.queuedState.update((list) => [...list, row]);
      return { error: null };
    } finally {
      this.busyState.set(false);
    }
  }

  removeCopy(copyId: string): void {
    this.queuedState.update((list) => list.filter((c) => c.id !== copyId));
  }

  async confirmCheckout(): Promise<{ ok: true } | { ok: false; error: CheckoutError }> {
    const member = this.memberState();
    const copies = this.queuedState();
    if (!member) return { ok: false, error: 'member_not_found' };
    if (copies.length === 0) return { ok: false, error: 'copies_required' };

    this.busyState.set(true);
    try {
      const result = await this.repo.checkout(
        member.id,
        copies.map((c) => c.barcode),
      );
      if (!result.ok) return result;

      this.lastDueAtState.set(result.loans[0]?.due_at ?? null);
      this.queuedState.set([]);
      return { ok: true };
    } finally {
      this.busyState.set(false);
    }
  }

  reset(): void {
    this.memberState.set(null);
    this.queuedState.set([]);
    this.lastDueAtState.set(null);
    this.busyState.set(false);
    this.loadMoney(null);
  }

  /**
   * Balance (materialized fines — the checkout gate's number) and projected
   * (provisional, from overdue_loans) for the member panel. Fire-and-forget:
   * the panel simply shows nothing until it lands.
   */
  private loadMoney(memberId: string | null): void {
    const generation = ++this.moneyGeneration;
    this.moneyState.set(null);
    if (!memberId) return;
    void this.ensureSettings();
    void this.repo.getMemberMoney(memberId).then(({ row }) => {
      if (row && generation === this.moneyGeneration) {
        this.moneyState.set(row);
      }
    });
  }

  private async ensureSettings(): Promise<void> {
    if (this.settingsLoaded) return;
    this.settingsLoaded = true;
    const { row } = await this.repo.getSettings();
    if (row) {
      this.currencyState.set(row.currency);
    }
  }
}
