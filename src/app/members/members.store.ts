import { Service, computed, inject, linkedSignal, resource, signal } from '@angular/core';

import { AuditService } from '../core/audit';
import { ResourceSettlement } from '../core/resource-settlement';
import type { MembersClientInsert, MembersClientUpdate } from '../core/supabase';
import { clampPage, isListEmpty } from '../ui';
import { MembersRepository } from './members.repository';
import type { MemberFormValue, MemberListItem, MemberStatus, MemberType } from './members.types';

const PAGE_SIZE = 10;
const EMPTY_LIST: MembersListValue = { rows: [], total: 0 };

type MembersListValue = { rows: MemberListItem[]; total: number };
type MembersListParams = {
  nameSearch: string;
  status: MemberStatus | 'all';
  page: number;
  pageSize: number;
  nonce: number;
};

@Service()
export class MembersStore {
  private readonly repo = inject(MembersRepository);
  private readonly audit = inject(AuditService);

  private readonly pageState = signal(1);
  private readonly nameSearchState = signal('');
  private readonly statusFilterState = signal<MemberStatus | 'all'>('all');
  private readonly savingState = signal(false);
  private readonly typesErrorState = signal<string | null>(null);
  private readonly memberTypesState = signal<MemberType[]>([]);
  private readonly query = signal<MembersListParams | undefined>(undefined);
  /**
   * A mutation clears any pre-existing list error up front, since it is
   * unrelated to the mutation's own outcome and a failed mutation returns
   * without reloading the list. Reset on every fresh `runQuery()` so a
   * genuinely new result is never masked.
   */
  private readonly errorClearedState = signal(false);

  private readonly listResource = resource({
    params: () => this.query(),
    loader: async ({ params }) => {
      const result = await this.repo.list({
        page: params.page,
        pageSize: params.pageSize,
        nameSearch: params.nameSearch,
        status: params.status,
      });
      if (result.error) {
        throw new Error('load_failed');
      }
      return { rows: result.rows, total: result.total };
    },
  });

  private readonly list = linkedSignal<MembersListValue | undefined, MembersListValue>({
    source: () => (this.listResource.error() ? EMPTY_LIST : this.listResource.value()),
    computation: (next, previous) => next ?? previous?.value ?? EMPTY_LIST,
  });

  private readonly settlement = new ResourceSettlement(this.listResource.isLoading);

  readonly rows = computed(() => this.list().rows);
  readonly total = computed(() => this.list().total);
  readonly page = this.pageState.asReadonly();
  readonly pageSize = PAGE_SIZE;
  readonly nameSearch = this.nameSearchState.asReadonly();
  readonly statusFilter = this.statusFilterState.asReadonly();
  readonly loading = this.listResource.isLoading;
  readonly saving = this.savingState.asReadonly();
  /** List-load failures only — never mixed with member-types errors. */
  readonly error = computed(() =>
    this.errorClearedState() ? null : this.listResource.error() ? 'load_failed' : null,
  );
  readonly typesError = this.typesErrorState.asReadonly();
  readonly memberTypes = this.memberTypesState.asReadonly();
  readonly empty = computed(() => isListEmpty(this.loading(), this.error(), this.total()));
  readonly hasActiveFilters = computed(
    () => this.nameSearchState().trim().length > 0 || this.statusFilterState() !== 'all',
  );

  async init(): Promise<void> {
    await Promise.all([this.loadMemberTypes(), this.load()]);
  }

  async load(): Promise<void> {
    await this.runQuery();
  }

  async loadMemberTypes(): Promise<void> {
    const result = await this.repo.listMemberTypes();
    if (result.error) {
      this.typesErrorState.set(result.error);
      this.memberTypesState.set([]);
      return;
    }
    this.typesErrorState.set(null);
    this.memberTypesState.set(result.rows);
  }

  setNameSearch(value: string): void {
    this.nameSearchState.set(value);
    this.pageState.set(1);
    void this.load();
  }

  setStatusFilter(value: MemberStatus | 'all'): void {
    this.statusFilterState.set(value);
    this.pageState.set(1);
    void this.load();
  }

  setPage(page: number): void {
    this.pageState.set(page);
    void this.load();
  }

  clearFilters(): void {
    this.nameSearchState.set('');
    this.statusFilterState.set('all');
    this.pageState.set(1);
    void this.load();
  }

  async createMember(form: MemberFormValue): Promise<{ error: string | null }> {
    return this.saveMember(null, form);
  }

  async updateMember(id: string, form: MemberFormValue): Promise<{ error: string | null }> {
    return this.saveMember(id, form);
  }

  async setMemberStatus(memberId: string, status: MemberStatus): Promise<{ error: string | null }> {
    this.savingState.set(true);
    this.errorClearedState.set(true);
    try {
      const result = await this.repo.setStatus(memberId, status);
      if (result.error) {
        return { error: result.error };
      }
      await this.load();
      return { error: this.error() ? 'load_failed' : null };
    } finally {
      this.savingState.set(false);
    }
  }

  private async saveMember(
    id: string | null,
    form: MemberFormValue,
  ): Promise<{ error: string | null }> {
    this.savingState.set(true);
    this.errorClearedState.set(true);
    try {
      const fields = {
        name: form.name.trim(),
        member_type_id: form.memberTypeId,
        email: emptyToNull(form.email),
        phone: emptyToNull(form.phone),
        card_barcode: form.cardBarcode.trim(),
      };
      const saved = id
        ? await this.repo.update(id, fields satisfies MembersClientUpdate)
        : await this.repo.create(fields satisfies MembersClientInsert);
      if (saved.error || !saved.row) {
        return { error: saved.error ?? 'save_failed' };
      }
      const audit = await this.audit.log({
        action: id ? 'member.update' : 'member.create',
        entityType: 'member',
        entityId: saved.row.id,
        detail: { name: saved.row.name, card_barcode: saved.row.card_barcode },
      });
      await this.load();
      if (this.error()) {
        return { error: 'load_failed' };
      }
      return { error: audit.error ? 'audit_failed' : null };
    } finally {
      this.savingState.set(false);
    }
  }

  private async runQuery(): Promise<void> {
    this.errorClearedState.set(false);
    const request = this.settlement.begin();
    this.query.set({
      nameSearch: this.nameSearchState(),
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

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
