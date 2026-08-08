import { Service, computed, inject, linkedSignal, resource, signal } from '@angular/core';

import { ResourceSettlement } from '../core/resource-settlement';
import { clampPage, isListEmpty } from '../ui';
import { AuditRepository } from './audit.repository';
import type { AuditActorRef, AuditListItem } from './audit.types';

const PAGE_SIZE = 10;
const EMPTY_LIST: AuditListValue = { rows: [], total: 0 };

type AuditListValue = { rows: AuditListItem[]; total: number };
type AuditListParams = {
  actorId: string | 'all';
  action: string | 'all';
  entityType: string | 'all';
  fromDate: string;
  toDate: string;
  page: number;
  pageSize: number;
  nonce: number;
};

@Service()
export class AuditStore {
  private readonly repo = inject(AuditRepository);

  private readonly pageState = signal(1);
  private readonly actorIdState = signal<string | 'all'>('all');
  private readonly actionState = signal<string | 'all'>('all');
  private readonly entityTypeState = signal<string | 'all'>('all');
  private readonly fromDateState = signal('');
  private readonly toDateState = signal('');
  private readonly actorsState = signal<AuditActorRef[]>([]);
  private readonly actorsErrorState = signal<string | null>(null);
  private readonly query = signal<AuditListParams | undefined>(undefined);

  private readonly listResource = resource({
    params: () => this.query(),
    loader: async ({ params }) => {
      const result = await this.repo.list({
        page: params.page,
        pageSize: params.pageSize,
        actorId: params.actorId,
        action: params.action,
        entityType: params.entityType,
        fromDate: params.fromDate,
        toDate: params.toDate,
      });
      if (result.error) {
        throw new Error('load_failed');
      }
      return { rows: result.rows, total: result.total };
    },
  });

  private readonly list = linkedSignal<AuditListValue | undefined, AuditListValue>({
    source: () => (this.listResource.error() ? EMPTY_LIST : this.listResource.value()),
    computation: (next, previous) => next ?? previous?.value ?? EMPTY_LIST,
  });

  private readonly settlement = new ResourceSettlement(this.listResource.isLoading);

  readonly rows = computed(() => this.list().rows);
  readonly total = computed(() => this.list().total);
  readonly page = this.pageState.asReadonly();
  readonly pageSize = PAGE_SIZE;
  readonly actorId = this.actorIdState.asReadonly();
  readonly action = this.actionState.asReadonly();
  readonly entityType = this.entityTypeState.asReadonly();
  readonly fromDate = this.fromDateState.asReadonly();
  readonly toDate = this.toDateState.asReadonly();
  readonly actors = this.actorsState.asReadonly();
  readonly loading = this.listResource.isLoading;
  /** List-load failures only — never mixed with actor-roster errors. */
  readonly error = computed(() => (this.listResource.error() ? 'load_failed' : null));
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
  readonly empty = computed(() =>
    isListEmpty(this.loading(), this.error(), this.total(), !this.dateRangeInvalid()),
  );

  async init(): Promise<void> {
    await Promise.all([this.loadActors(), this.load()]);
  }

  async load(): Promise<void> {
    await this.runQuery();
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

  private async runQuery(): Promise<void> {
    if (this.dateRangeInvalid()) {
      // Explicitly supersedes any in-flight request rather than leaving its
      // token current — this issues no replacement request of its own, so
      // relying on the resource's own loading→idle transition to unblock a
      // stale caller would leave `isCurrent()` true for it in the meantime.
      this.settlement.invalidate();
      this.query.set(undefined);
      this.list.set(EMPTY_LIST);
      return;
    }

    const request = this.settlement.begin();
    this.query.set({
      actorId: this.actorIdState(),
      action: this.actionState(),
      entityType: this.entityTypeState(),
      fromDate: this.fromDateState(),
      toDate: this.toDateState(),
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
