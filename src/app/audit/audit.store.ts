import { Service, computed, inject, signal } from '@angular/core';

import { pageCount } from '../ui';
import { AuditRepository } from './audit.repository';
import type { AuditActorRef, AuditListItem } from './audit.types';

const PAGE_SIZE = 10;

@Service()
export class AuditStore {
  private readonly repo = inject(AuditRepository);
  /** Bumped on each load so superseded filter responses are ignored. */
  private loadGeneration = 0;

  private readonly rowsState = signal<AuditListItem[]>([]);
  private readonly totalState = signal(0);
  private readonly pageState = signal(1);
  private readonly actorIdState = signal<string | 'all'>('all');
  private readonly actionState = signal<string | 'all'>('all');
  private readonly entityTypeState = signal<string | 'all'>('all');
  private readonly fromDateState = signal('');
  private readonly toDateState = signal('');
  private readonly actorsState = signal<AuditActorRef[]>([]);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly actorsErrorState = signal<string | null>(null);

  readonly rows = this.rowsState.asReadonly();
  readonly total = this.totalState.asReadonly();
  readonly page = this.pageState.asReadonly();
  readonly pageSize = PAGE_SIZE;
  readonly actorId = this.actorIdState.asReadonly();
  readonly action = this.actionState.asReadonly();
  readonly entityType = this.entityTypeState.asReadonly();
  readonly fromDate = this.fromDateState.asReadonly();
  readonly toDate = this.toDateState.asReadonly();
  readonly actors = this.actorsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  /** List-load failures only — never mixed with actor-roster errors. */
  readonly error = this.errorState.asReadonly();
  readonly actorsError = this.actorsErrorState.asReadonly();
  readonly hasActiveFilters = computed(
    () =>
      this.actorIdState() !== 'all' ||
      this.actionState() !== 'all' ||
      this.entityTypeState() !== 'all' ||
      this.fromDateState().trim().length > 0 ||
      this.toDateState().trim().length > 0,
  );
  /** True when both ends are set and from is after to (YYYY-MM-DD lexicographic). */
  readonly dateRangeInvalid = computed(() => {
    const from = this.fromDateState().trim();
    const to = this.toDateState().trim();
    return from.length > 0 && to.length > 0 && from > to;
  });
  readonly empty = computed(
    () =>
      !this.loadingState() &&
      !this.errorState() &&
      !this.dateRangeInvalid() &&
      this.totalState() === 0,
  );

  async init(): Promise<void> {
    await Promise.all([this.loadActors(), this.load()]);
  }

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      if (this.dateRangeInvalid()) {
        this.rowsState.set([]);
        this.totalState.set(0);
        return;
      }

      const page = this.pageState();
      const result = await this.repo.list({
        page,
        pageSize: PAGE_SIZE,
        actorId: this.actorIdState(),
        action: this.actionState(),
        entityType: this.entityTypeState(),
        fromDate: this.fromDateState(),
        toDate: this.toDateState(),
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

      const maxPage = pageCount(result.total, PAGE_SIZE);
      if (result.total > 0 && page > maxPage) {
        this.pageState.set(maxPage);
        await this.load();
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

  async loadActors(): Promise<void> {
    const result = await this.repo.listActors();
    if (result.error) {
      this.actorsErrorState.set(result.error);
      this.actorsState.set([]);
      return;
    }
    this.actorsErrorState.set(null);
    this.actorsState.set(result.rows);
  }

  setActorId(value: string | 'all'): Promise<void> {
    this.actorIdState.set(value);
    this.pageState.set(1);
    return this.load();
  }

  setAction(value: string | 'all'): Promise<void> {
    this.actionState.set(value);
    this.pageState.set(1);
    return this.load();
  }

  setEntityType(value: string | 'all'): Promise<void> {
    this.entityTypeState.set(value);
    this.pageState.set(1);
    return this.load();
  }

  setFromDate(value: string): Promise<void> {
    this.fromDateState.set(value);
    this.pageState.set(1);
    return this.load();
  }

  setToDate(value: string): Promise<void> {
    this.toDateState.set(value);
    this.pageState.set(1);
    return this.load();
  }

  setPage(page: number): Promise<void> {
    this.pageState.set(page);
    return this.load();
  }

  clearFilters(): Promise<void> {
    this.actorIdState.set('all');
    this.actionState.set('all');
    this.entityTypeState.set('all');
    this.fromDateState.set('');
    this.toDateState.set('');
    this.pageState.set(1);
    return this.load();
  }
}
