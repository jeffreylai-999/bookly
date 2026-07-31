import { Service, computed, inject, signal } from '@angular/core';

import { AuditService } from '../core/audit';
import type { MembersClientInsert, MembersClientUpdate } from '../core/supabase';
import { MembersRepository } from './members.repository';
import type {
  MemberFormValue,
  MemberListItem,
  MemberStatus,
  MemberType,
} from './members.types';

const PAGE_SIZE = 10;

@Service()
export class MembersStore {
  private readonly repo = inject(MembersRepository);
  private readonly audit = inject(AuditService);
  /** Bumped on each load so superseded filter/search responses are ignored. */
  private loadGeneration = 0;

  private readonly rowsState = signal<MemberListItem[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly nameSearchState = signal('');
  private readonly statusFilterState = signal<MemberStatus | 'all'>('all');
  private readonly loadingState = signal(false);
  private readonly savingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly memberTypesState = signal<MemberType[]>([]);

  readonly rows = this.rowsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = PAGE_SIZE;
  readonly nameSearch = this.nameSearchState.asReadonly();
  readonly statusFilter = this.statusFilterState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly saving = this.savingState.asReadonly();
  readonly error = this.errorState.asReadonly();
  readonly memberTypes = this.memberTypesState.asReadonly();
  readonly empty = computed(
    () => !this.loadingState() && !this.errorState() && this.totalState() === 0,
  );
  readonly hasActiveFilters = computed(
    () => this.nameSearchState().trim().length > 0 || this.statusFilterState() !== 'all',
  );

  async init(): Promise<void> {
    await Promise.all([this.loadMemberTypes(), this.load()]);
  }

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const result = await this.repo.list({
        page: this.pageState(),
        pageSize: PAGE_SIZE,
        nameSearch: this.nameSearchState(),
        status: this.statusFilterState(),
      });
      if (generation !== this.loadGeneration) {
        return;
      }
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

  async loadMemberTypes(): Promise<void> {
    const result = await this.repo.listMemberTypes();
    if (result.error) {
      this.errorState.set(result.error);
      return;
    }
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

  async setMemberStatus(
    memberId: string,
    status: MemberStatus,
  ): Promise<{ error: string | null }> {
    this.savingState.set(true);
    this.errorState.set(null);
    try {
      const result = await this.repo.setStatus(memberId, status);
      if (result.error) {
        return { error: result.error };
      }
      await this.load();
      return { error: this.errorState() ? 'load_failed' : null };
    } finally {
      this.savingState.set(false);
    }
  }

  private async saveMember(
    id: string | null,
    form: MemberFormValue,
  ): Promise<{ error: string | null }> {
    this.savingState.set(true);
    this.errorState.set(null);
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
      if (this.errorState()) {
        return { error: 'load_failed' };
      }
      return { error: audit.error ? 'audit_failed' : null };
    } finally {
      this.savingState.set(false);
    }
  }
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}
