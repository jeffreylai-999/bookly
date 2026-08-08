import { ApplicationRef, Service, computed, inject, resource, signal } from '@angular/core';

import { AppSettingsService } from '../core/app-settings';
import { CirculationRepository } from '../circulation/circulation.repository';
import type { LoanListItem, RenewResult } from '../circulation/circulation.types';
import { FinesRepository } from '../fines/fines.repository';
import { HoldsRepository } from '../holds/holds.repository';
import { MembersRepository } from './members.repository';
import type { MemberStatus } from './members.types';

type MemberRequest = { memberId: string; nonce: number };

function loadError(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  return error ? 'load_failed' : null;
}

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
  private readonly appSettings = inject(AppSettingsService);
  private readonly appRef = inject(ApplicationRef);

  private readonly memberIdState = signal<string | undefined>(undefined);
  private readonly statusSavingState = signal(false);
  private readonly renewingIdState = signal<string | null>(null);
  private readonly memberRequest = signal<MemberRequest | undefined>(undefined);
  private readonly loansRequest = signal<MemberRequest | undefined>(undefined);
  private readonly holdsRequest = signal<MemberRequest | undefined>(undefined);
  private readonly finesRequest = signal<MemberRequest | undefined>(undefined);
  private readonly moneyRequest = signal<MemberRequest | undefined>(undefined);
  private requestNonce = 0;

  private readonly memberResource = resource({
    params: () => this.memberRequest(),
    loader: async ({ params }) => {
      const result = await this.membersRepo.getById(params.memberId);
      if (result.error) throw new Error(result.error);
      return result.row;
    },
  });
  private readonly loansResource = resource({
    params: () => this.loansRequest(),
    loader: async ({ params }) => {
      const result = await this.circulationRepo.listActiveLoansByMember(params.memberId);
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });
  private readonly holdsResource = resource({
    params: () => this.holdsRequest(),
    loader: async ({ params }) => {
      const result = await this.holdsRepo.listByMember(params.memberId);
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });
  private readonly finesResource = resource({
    params: () => this.finesRequest(),
    loader: async ({ params }) => {
      const result = await this.finesRepo.listByMember(params.memberId);
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });
  private readonly moneyResource = resource({
    params: () => this.moneyRequest(),
    loader: async ({ params }) => {
      const result = await this.circulationRepo.getMemberMoney(params.memberId);
      if (result.error) throw new Error(result.error);
      return result.row;
    },
  });

  readonly member = computed(() =>
    this.memberResource.error() ? null : (this.memberResource.value() ?? null),
  );
  readonly memberLoading = this.memberResource.isLoading;
  readonly memberError = computed(() => loadError(this.memberResource.error()));
  readonly notFound = computed(
    () =>
      this.memberIdState() !== undefined &&
      !this.memberLoading() &&
      this.memberError() === null &&
      this.member() === null,
  );
  readonly statusSaving = this.statusSavingState.asReadonly();

  readonly loans = computed(() =>
    this.loansResource.error() ? [] : (this.loansResource.value() ?? []),
  );
  readonly loansLoading = this.loansResource.isLoading;
  readonly loansError = computed(() => loadError(this.loansResource.error()));
  readonly renewingId = this.renewingIdState.asReadonly();

  readonly holds = computed(() =>
    this.holdsResource.error() ? [] : (this.holdsResource.value() ?? []),
  );
  readonly holdsLoading = this.holdsResource.isLoading;
  readonly holdsError = computed(() => loadError(this.holdsResource.error()));

  readonly fines = computed(() =>
    this.finesResource.error() ? [] : (this.finesResource.value() ?? []),
  );
  readonly finesLoading = this.finesResource.isLoading;
  readonly finesError = computed(() => loadError(this.finesResource.error()));

  readonly money = computed(() =>
    this.moneyResource.error() ? null : (this.moneyResource.value() ?? null),
  );
  readonly moneyLoading = this.moneyResource.isLoading;
  readonly moneyError = computed(() => loadError(this.moneyResource.error()));

  readonly currency = this.appSettings.currency;

  async init(memberId: string): Promise<void> {
    this.memberIdState.set(memberId);
    // A route change reuses this component/store instance, so these five
    // writes land before any await: a new request drops each resource's
    // previous value in the same tick. Without that, navigating between two
    // member-detail pages would render the old member's panels — and let
    // Renew/Suspend fire against their stale rows — until the new reads
    // resolve.
    this.memberRequest.set(this.nextRequest(memberId));
    this.loansRequest.set(this.nextRequest(memberId));
    this.holdsRequest.set(this.nextRequest(memberId));
    this.finesRequest.set(this.nextRequest(memberId));
    this.moneyRequest.set(this.nextRequest(memberId));
    await Promise.all([this.appRef.whenStable(), this.appSettings.load()]);
  }

  async setMemberStatus(status: MemberStatus): Promise<{ error: string | null }> {
    const memberId = this.memberIdState();
    if (!memberId) return { error: 'unexpected' };
    this.statusSavingState.set(true);
    try {
      const result = await this.membersRepo.setStatus(memberId, status);
      if (result.error) return { error: result.error };
      if (this.memberIdState() !== memberId) return { error: null };
      // Same `reload()` caveat as renew below: it is a no-op returning false
      // while the member read is still in flight, and Suspend is clickable as
      // soon as the header renders.
      if (!this.memberResource.reload()) this.memberRequest.set(this.nextRequest(memberId));
      await this.appRef.whenStable();
      return { error: this.memberError() ? 'load_failed' : null };
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
      //
      // `reload()` is a documented no-op that returns false while a read is
      // still in flight, and the money read is the slowest of the five (it
      // makes two sequential round trips) so a renewal can easily land while
      // it is pending. Fall back to a fresh request in that case, or the
      // pre-renew balance and projected fine stay on screen until navigation.
      // Preferring `reload()` keeps the current rows visible while it runs; a
      // new request would blank the panel first.
      if (result.ok && memberId && this.memberIdState() === memberId) {
        if (!this.loansResource.reload()) this.loansRequest.set(this.nextRequest(memberId));
        if (!this.moneyResource.reload()) this.moneyRequest.set(this.nextRequest(memberId));
        await this.appRef.whenStable();
      }
      return result;
    } finally {
      this.renewingIdState.set(null);
    }
  }

  private nextRequest(memberId: string): MemberRequest {
    return { memberId, nonce: ++this.requestNonce };
  }
}
