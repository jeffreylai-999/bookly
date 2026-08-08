import {
  ApplicationRef,
  Service,
  computed,
  inject,
  linkedSignal,
  resource,
  signal,
} from '@angular/core';

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

type MetricRequest = {
  range: RangeDays;
  /**
   * Monotonic per-load nonce. Every `load()` is therefore a distinct request,
   * which supersedes an in-flight read instead of dropping it — `reload()` is
   * a documented no-op while the resource status is `loading`.
   */
  nonce: number;
};

function loadError(error: unknown): string | null {
  if (error instanceof Error) return error.message;
  return error ? 'load_failed' : null;
}

/** The last good rows, or `null` for "nothing known yet". */
type MetricValue<TRow> = TRow[] | null;
/** Adds the resource's own "no news" reading to {@link MetricValue}. */
type MetricSource<TRow> = MetricValue<TRow> | undefined;

/**
 * Three-state stickiness for one metric:
 *
 * - rows — a settled read; keep them.
 * - `undefined` — the gap between two reads, because a params change drops the
 *   resource's previous stream. Hold the last good rows so a range change does
 *   not flash an empty chart or claim an empty table.
 * - `null` — the read failed. Discard whatever was held, so the card shows its
 *   alert instead of the previous range's numbers, and so a later retry reads
 *   as pending rather than reusing the blank the failure left behind.
 */
function keepLastGood<TRow>(
  next: MetricSource<TRow>,
  previous?: { value: MetricValue<TRow> },
): MetricValue<TRow> {
  return next === undefined ? (previous?.value ?? null) : next;
}

/**
 * Every metric owns a resource keyed by the requested range, so a rejected RPC
 * only blanks its own card and a superseded range is discarded by the framework
 * instead of a hand-rolled generation guard.
 *
 * Each metric value is sticky across a range change; see {@link keepLastGood}.
 * The sticky source reads `error()` first because `value()` throws once the
 * resource has errored.
 */
@Service()
export class ReportsStore {
  private readonly repo = inject(ReportsRepository);
  private readonly appSettings = inject(AppSettingsService);
  private readonly appRef = inject(ApplicationRef);

  private readonly rangeState = signal<RangeDays>(DEFAULT_RANGE);
  /** `undefined` keeps every metric idle until the first imperative load. */
  private readonly request = signal<MetricRequest | undefined>(undefined);
  private requestNonce = 0;

  private readonly overdueAgingResource = resource({
    params: () => this.request(),
    loader: async () => {
      const result = await this.repo.loadOverdueAging();
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });
  private readonly deadStockResource = resource({
    params: () => this.request(),
    loader: async ({ params }) => {
      const result = await this.repo.loadDeadStock(params.range);
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });
  private readonly highDemandResource = resource({
    params: () => this.request(),
    loader: async ({ params }) => {
      const result = await this.repo.loadHighDemand(params.range);
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });
  private readonly fineCollectionResource = resource({
    params: () => this.request(),
    loader: async ({ params }) => {
      const result = await this.repo.loadFineCollection(params.range);
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });
  private readonly newMemberGrowthResource = resource({
    params: () => this.request(),
    loader: async ({ params }) => {
      const result = await this.repo.loadNewMemberGrowth(params.range);
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });
  private readonly peakHoursResource = resource({
    params: () => this.request(),
    loader: async ({ params }) => {
      const result = await this.repo.loadPeakHours(params.range);
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });
  private readonly genreBreakdownResource = resource({
    params: () => this.request(),
    loader: async ({ params }) => {
      const result = await this.repo.loadGenreBreakdown(params.range);
      if (result.error) throw new Error(result.error);
      return result.rows;
    },
  });

  private readonly overdueAgingValue = linkedSignal<
    MetricSource<OverdueAgingRow>,
    MetricValue<OverdueAgingRow>
  >({
    source: () => (this.overdueAgingResource.error() ? null : this.overdueAgingResource.value()),
    computation: keepLastGood,
  });
  private readonly deadStockValue = linkedSignal<
    MetricSource<DeadStockRow>,
    MetricValue<DeadStockRow>
  >({
    source: () => (this.deadStockResource.error() ? null : this.deadStockResource.value()),
    computation: keepLastGood,
  });
  private readonly highDemandValue = linkedSignal<
    MetricSource<HighDemandRow>,
    MetricValue<HighDemandRow>
  >({
    source: () => (this.highDemandResource.error() ? null : this.highDemandResource.value()),
    computation: keepLastGood,
  });
  private readonly fineCollectionValue = linkedSignal<
    MetricSource<FineCollectionRow>,
    MetricValue<FineCollectionRow>
  >({
    source: () =>
      this.fineCollectionResource.error() ? null : this.fineCollectionResource.value(),
    computation: keepLastGood,
  });
  private readonly newMemberGrowthValue = linkedSignal<
    MetricSource<NewMemberGrowthRow>,
    MetricValue<NewMemberGrowthRow>
  >({
    source: () =>
      this.newMemberGrowthResource.error() ? null : this.newMemberGrowthResource.value(),
    computation: keepLastGood,
  });
  private readonly peakHoursValue = linkedSignal<
    MetricSource<PeakHoursRow>,
    MetricValue<PeakHoursRow>
  >({
    source: () => (this.peakHoursResource.error() ? null : this.peakHoursResource.value()),
    computation: keepLastGood,
  });
  private readonly genreBreakdownValue = linkedSignal<
    MetricSource<GenreBreakdownRow>,
    MetricValue<GenreBreakdownRow>
  >({
    source: () =>
      this.genreBreakdownResource.error() ? null : this.genreBreakdownResource.value(),
    computation: keepLastGood,
  });

  readonly range = this.rangeState.asReadonly();
  readonly currency = this.appSettings.currency;

  readonly overdueAging = computed(() => this.overdueAgingValue() ?? []);
  readonly overdueAgingError = computed(() => loadError(this.overdueAgingResource.error()));
  readonly overdueAgingLoading = this.overdueAgingResource.isLoading;
  readonly overdueAgingPending = computed(
    () => this.overdueAgingValue() === null && this.overdueAgingError() === null,
  );

  readonly deadStock = computed(() => this.deadStockValue() ?? []);
  readonly deadStockError = computed(() => loadError(this.deadStockResource.error()));
  readonly deadStockLoading = this.deadStockResource.isLoading;
  readonly deadStockPending = computed(
    () => this.deadStockValue() === null && this.deadStockError() === null,
  );

  readonly highDemand = computed(() => this.highDemandValue() ?? []);
  readonly highDemandError = computed(() => loadError(this.highDemandResource.error()));
  readonly highDemandLoading = this.highDemandResource.isLoading;
  readonly highDemandPending = computed(
    () => this.highDemandValue() === null && this.highDemandError() === null,
  );

  readonly fineCollection = computed(() => this.fineCollectionValue() ?? []);
  readonly fineCollectionError = computed(() => loadError(this.fineCollectionResource.error()));
  readonly fineCollectionLoading = this.fineCollectionResource.isLoading;
  readonly fineCollectionPending = computed(
    () => this.fineCollectionValue() === null && this.fineCollectionError() === null,
  );

  readonly newMemberGrowth = computed(() => this.newMemberGrowthValue() ?? []);
  readonly newMemberGrowthError = computed(() => loadError(this.newMemberGrowthResource.error()));
  readonly newMemberGrowthLoading = this.newMemberGrowthResource.isLoading;
  readonly newMemberGrowthPending = computed(
    () => this.newMemberGrowthValue() === null && this.newMemberGrowthError() === null,
  );

  readonly peakHours = computed(() => this.peakHoursValue() ?? []);
  readonly peakHoursError = computed(() => loadError(this.peakHoursResource.error()));
  readonly peakHoursLoading = this.peakHoursResource.isLoading;
  readonly peakHoursPending = computed(
    () => this.peakHoursValue() === null && this.peakHoursError() === null,
  );

  readonly genreBreakdown = computed(() => this.genreBreakdownValue() ?? []);
  readonly genreBreakdownError = computed(() => loadError(this.genreBreakdownResource.error()));
  readonly genreBreakdownLoading = this.genreBreakdownResource.isLoading;
  readonly genreBreakdownPending = computed(
    () => this.genreBreakdownValue() === null && this.genreBreakdownError() === null,
  );

  /** Compatibility aggregates: the page-level toast still needs one answer. */
  readonly loading = computed(
    () =>
      this.overdueAgingLoading() ||
      this.deadStockLoading() ||
      this.highDemandLoading() ||
      this.fineCollectionLoading() ||
      this.newMemberGrowthLoading() ||
      this.peakHoursLoading() ||
      this.genreBreakdownLoading(),
  );
  readonly error = computed(
    () =>
      this.overdueAgingError() ??
      this.deadStockError() ??
      this.highDemandError() ??
      this.fineCollectionError() ??
      this.newMemberGrowthError() ??
      this.peakHoursError() ??
      this.genreBreakdownError(),
  );

  readonly totalOverdue = computed(() =>
    this.overdueAging().reduce((sum, row) => sum + row.loan_count, 0),
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

  /** Bridges promise-based callers until they can read the resource signals directly. */
  async load(): Promise<void> {
    this.request.set({ range: this.rangeState(), nonce: ++this.requestNonce });
    await this.appRef.whenStable();
  }
}
