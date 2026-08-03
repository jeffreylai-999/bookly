import { Service, inject, signal } from '@angular/core';

import { CirculationRepository, type MemberMoney } from '../circulation/circulation.repository';
import type { LoanListItem, RenewResult } from '../circulation/circulation.types';
import { FinesRepository } from '../fines/fines.repository';
import type { FineListItem } from '../fines/fines.types';
import { HoldsRepository } from '../holds/holds.repository';
import type { HoldListItem } from '../holds/holds.types';
import { MembersRepository } from './members.repository';
import type { MemberListItem, MemberStatus } from './members.types';

/**
 * The whole-situation view of one member: status/contact, current loans (with
 * renew), hold queue, and fine history with the same materialized/projected
 * balance split the checkout gate uses. Four panels load independently so a
 * failure in one (say, fines) never blocks the others from rendering.
 */
@Service()
export class MemberDetailStore {
  private readonly membersRepo = inject(MembersRepository);
  private readonly circulationRepo = inject(CirculationRepository);
  private readonly holdsRepo = inject(HoldsRepository);
  private readonly finesRepo = inject(FinesRepository);

  /** Guards against a superseded init() clobbering state from a newer one. */
  private readonly memberIdState = signal<string | null>(null);

  private readonly memberState = signal<MemberListItem | null>(null);
  private readonly memberLoadingState = signal(false);
  private readonly memberErrorState = signal<string | null>(null);
  private readonly notFoundState = signal(false);
  private readonly statusSavingState = signal(false);

  private readonly loansState = signal<LoanListItem[]>([]);
  private readonly loansLoadingState = signal(false);
  private readonly loansErrorState = signal<string | null>(null);
  private readonly renewingIdState = signal<string | null>(null);

  private readonly holdsState = signal<HoldListItem[]>([]);
  private readonly holdsLoadingState = signal(false);
  private readonly holdsErrorState = signal<string | null>(null);

  private readonly finesState = signal<FineListItem[]>([]);
  private readonly finesLoadingState = signal(false);
  private readonly finesErrorState = signal<string | null>(null);

  private readonly moneyState = signal<MemberMoney | null>(null);
  private readonly moneyErrorState = signal<string | null>(null);

  private readonly currencyState = signal('USD');

  readonly member = this.memberState.asReadonly();
  readonly memberLoading = this.memberLoadingState.asReadonly();
  readonly memberError = this.memberErrorState.asReadonly();
  readonly notFound = this.notFoundState.asReadonly();
  readonly statusSaving = this.statusSavingState.asReadonly();

  readonly loans = this.loansState.asReadonly();
  readonly loansLoading = this.loansLoadingState.asReadonly();
  readonly loansError = this.loansErrorState.asReadonly();
  readonly renewingId = this.renewingIdState.asReadonly();

  readonly holds = this.holdsState.asReadonly();
  readonly holdsLoading = this.holdsLoadingState.asReadonly();
  readonly holdsError = this.holdsErrorState.asReadonly();

  readonly fines = this.finesState.asReadonly();
  readonly finesLoading = this.finesLoadingState.asReadonly();
  readonly finesError = this.finesErrorState.asReadonly();

  readonly money = this.moneyState.asReadonly();
  readonly moneyError = this.moneyErrorState.asReadonly();

  readonly currency = this.currencyState.asReadonly();

  async init(memberId: string): Promise<void> {
    this.memberIdState.set(memberId);
    this.notFoundState.set(false);
    await Promise.all([
      this.loadMember(memberId),
      this.loadLoans(memberId),
      this.loadHolds(memberId),
      this.loadFines(memberId),
      this.loadMoney(memberId),
      this.loadCurrency(),
    ]);
  }

  async setMemberStatus(status: MemberStatus): Promise<{ error: string | null }> {
    const memberId = this.memberIdState();
    if (!memberId) return { error: 'unexpected' };
    this.statusSavingState.set(true);
    try {
      const result = await this.membersRepo.setStatus(memberId, status);
      if (result.error) return { error: result.error };
      await this.loadMember(memberId);
      return { error: this.memberErrorState() ? 'load_failed' : null };
    } finally {
      this.statusSavingState.set(false);
    }
  }

  async renew(loan: LoanListItem): Promise<RenewResult> {
    if (this.renewingIdState() !== null) return { ok: false, error: 'unexpected' };
    const memberId = this.memberIdState();

    this.renewingIdState.set(loan.id);
    try {
      const result = await this.circulationRepo.renew(loan.id);
      // A renewed loan sorts by its new due date, and the balance can shift
      // once the loan is no longer overdue — reload both rather than patch.
      if (result.ok && memberId) {
        await Promise.all([this.loadLoans(memberId), this.loadMoney(memberId)]);
      }
      return result;
    } finally {
      this.renewingIdState.set(null);
    }
  }

  private async loadMember(memberId: string): Promise<void> {
    this.memberLoadingState.set(true);
    this.memberErrorState.set(null);
    try {
      const result = await this.membersRepo.getById(memberId);
      if (this.memberIdState() !== memberId) return;
      if (result.error) {
        this.memberErrorState.set(result.error);
        return;
      }
      if (!result.row) {
        this.notFoundState.set(true);
        return;
      }
      this.memberState.set(result.row);
    } finally {
      if (this.memberIdState() === memberId) {
        this.memberLoadingState.set(false);
      }
    }
  }

  private async loadLoans(memberId: string): Promise<void> {
    this.loansLoadingState.set(true);
    this.loansErrorState.set(null);
    try {
      const result = await this.circulationRepo.listActiveLoansByMember(memberId);
      if (this.memberIdState() !== memberId) return;
      if (result.error) {
        this.loansErrorState.set(result.error);
        this.loansState.set([]);
        return;
      }
      this.loansState.set(result.rows);
    } finally {
      if (this.memberIdState() === memberId) {
        this.loansLoadingState.set(false);
      }
    }
  }

  private async loadHolds(memberId: string): Promise<void> {
    this.holdsLoadingState.set(true);
    this.holdsErrorState.set(null);
    try {
      const result = await this.holdsRepo.listByMember(memberId);
      if (this.memberIdState() !== memberId) return;
      if (result.error) {
        this.holdsErrorState.set(result.error);
        this.holdsState.set([]);
        return;
      }
      this.holdsState.set(result.rows);
    } finally {
      if (this.memberIdState() === memberId) {
        this.holdsLoadingState.set(false);
      }
    }
  }

  private async loadFines(memberId: string): Promise<void> {
    this.finesLoadingState.set(true);
    this.finesErrorState.set(null);
    try {
      const result = await this.finesRepo.listByMember(memberId);
      if (this.memberIdState() !== memberId) return;
      if (result.error) {
        this.finesErrorState.set(result.error);
        this.finesState.set([]);
        return;
      }
      this.finesState.set(result.rows);
    } finally {
      if (this.memberIdState() === memberId) {
        this.finesLoadingState.set(false);
      }
    }
  }

  private async loadMoney(memberId: string): Promise<void> {
    this.moneyErrorState.set(null);
    const result = await this.circulationRepo.getMemberMoney(memberId);
    if (this.memberIdState() !== memberId) return;
    if (result.error) {
      this.moneyErrorState.set(result.error);
      return;
    }
    this.moneyState.set(result.row);
  }

  private async loadCurrency(): Promise<void> {
    const settings = await this.circulationRepo.getSettings();
    if (settings.row) {
      this.currencyState.set(settings.row.currency);
    }
  }
}
