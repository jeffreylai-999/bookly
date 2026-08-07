import { Service, computed, inject, signal } from '@angular/core';

import { AppSettingsService } from '../core/app-settings';
import { ReportsRepository } from './reports.repository';
import { isRangeDays } from './reports.types';
import type {
  DeadStockRow,
  FineCollectionRow,
  GenreBreakdownRow,
  HighDemandRow,
  NewMemberGrowthRow,
  OverdueAgingRow,
  PeakHoursRow,
  RangeDays,
} from './reports.types';

const DEFAULT_RANGE: RangeDays = 14;

@Service()
export class ReportsStore {
  private readonly repo = inject(ReportsRepository);
  private readonly appSettings = inject(AppSettingsService);
  /** Bumped on each load so a superseded range response is ignored. */
  private loadGeneration = 0;

  private readonly rangeState = signal<RangeDays>(DEFAULT_RANGE);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  private readonly overdueAgingState = signal<OverdueAgingRow[]>([]);
  private readonly deadStockState = signal<DeadStockRow[]>([]);
  private readonly highDemandState = signal<HighDemandRow[]>([]);
  private readonly fineCollectionState = signal<FineCollectionRow[]>([]);
  private readonly newMemberGrowthState = signal<NewMemberGrowthRow[]>([]);
  private readonly peakHoursState = signal<PeakHoursRow[]>([]);
  private readonly genreBreakdownState = signal<GenreBreakdownRow[]>([]);

  readonly range = this.rangeState.asReadonly();
  readonly currency = this.appSettings.currency;
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  readonly overdueAging = this.overdueAgingState.asReadonly();
  readonly deadStock = this.deadStockState.asReadonly();
  readonly highDemand = this.highDemandState.asReadonly();
  readonly fineCollection = this.fineCollectionState.asReadonly();
  readonly newMemberGrowth = this.newMemberGrowthState.asReadonly();
  readonly peakHours = this.peakHoursState.asReadonly();
  readonly genreBreakdown = this.genreBreakdownState.asReadonly();

  readonly totalOverdue = computed(() =>
    this.overdueAgingState().reduce((sum, row) => sum + row.loan_count, 0),
  );

  async init(): Promise<void> {
    await this.appSettings.load();
    const stored = this.appSettings.reportRangeDays();
    if (stored !== null && isRangeDays(stored)) {
      this.rangeState.set(stored);
    }
    await this.load();
  }

  async setRange(range: RangeDays): Promise<void> {
    if (range === this.rangeState()) return;
    this.rangeState.set(range);
    await this.load();
  }

  async load(): Promise<void> {
    const generation = ++this.loadGeneration;
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const { data, error } = await this.repo.loadAll(this.rangeState());
      if (generation !== this.loadGeneration) return;
      if (error || !data) {
        this.errorState.set(error);
        return;
      }
      this.overdueAgingState.set(data.overdueAging);
      this.deadStockState.set(data.deadStock);
      this.highDemandState.set(data.highDemand);
      this.fineCollectionState.set(data.fineCollection);
      this.newMemberGrowthState.set(data.newMemberGrowth);
      this.peakHoursState.set(data.peakHours);
      this.genreBreakdownState.set(data.genreBreakdown);
    } catch {
      // The repository resolves { data, error } for expected API failures;
      // this only catches the unexpected (e.g. a network-level rejection
      // from one of the seven parallel RPC calls in Promise.all).
      if (generation === this.loadGeneration) {
        this.errorState.set('unexpected');
      }
    } finally {
      if (generation === this.loadGeneration) {
        this.loadingState.set(false);
      }
    }
  }
}
