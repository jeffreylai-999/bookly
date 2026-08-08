import { TestBed } from '@angular/core/testing';

import { AppSettingsService } from '../core/app-settings';
import { ReportsRepository } from './reports.repository';
import { ReportsStore } from './reports.store';
import { RANGE_DAYS_OPTIONS } from './reports.types';
import type { DeadStockRow, GenreBreakdownRow, PeakHoursRow } from './reports.types';

type MetricResult<TRow> = { rows: TRow[]; error: string | null };

/** A repository read that the test resolves by hand, one call at a time. */
function deferredMetric<TRow>() {
  const resolvers: ((value: MetricResult<TRow>) => void)[] = [];
  const load = vi.fn(
    () =>
      new Promise<MetricResult<TRow>>((resolve) => {
        resolvers.push(resolve);
      }),
  );
  return { load, resolve: (call: number, value: MetricResult<TRow>) => resolvers[call]!(value) };
}

function emptyRepo() {
  return {
    loadOverdueAging: vi.fn().mockResolvedValue({ rows: [], error: null }),
    loadDeadStock: vi.fn().mockResolvedValue({ rows: [], error: null }),
    loadHighDemand: vi.fn().mockResolvedValue({ rows: [], error: null }),
    loadFineCollection: vi.fn().mockResolvedValue({ rows: [], error: null }),
    loadNewMemberGrowth: vi.fn().mockResolvedValue({ rows: [], error: null }),
    loadPeakHours: vi.fn().mockResolvedValue({ rows: [], error: null }),
    loadGenreBreakdown: vi.fn().mockResolvedValue({ rows: [], error: null }),
  };
}

/**
 * One row per metric the page publishes, so every metric's wiring — which
 * repository call backs it, whether the range reaches that call, and which
 * signals it feeds — is asserted, not just the two or three sampled below.
 */
type Metric = {
  label: string;
  method: string;
  /** Overdue aging is a present-state snapshot; the range must not reach it. */
  rangeScoped: boolean;
  rows: unknown[];
  read: (store: ReportsStore) => unknown;
  readError: (store: ReportsStore) => string | null;
  readPending: (store: ReportsStore) => boolean;
};

const metrics: Metric[] = [
  {
    label: 'overdue aging',
    method: 'loadOverdueAging',
    rangeScoped: false,
    rows: [{ bucket: '1-7', bucket_order: 1, loan_count: 3 }],
    read: (store) => store.overdueAging(),
    readError: (store) => store.overdueAgingError(),
    readPending: (store) => store.overdueAgingPending(),
  },
  {
    label: 'dead stock',
    method: 'loadDeadStock',
    rangeScoped: true,
    rows: [
      { title_id: 't1', title: 'Dune', author: 'Herbert', genre: 'Sci-fi', lendable_copies: 1 },
    ],
    read: (store) => store.deadStock(),
    readError: (store) => store.deadStockError(),
    readPending: (store) => store.deadStockPending(),
  },
  {
    label: 'high demand',
    method: 'loadHighDemand',
    rangeScoped: true,
    rows: [
      {
        title_id: 't2',
        title: 'Hot Title',
        author: 'Author H',
        checkout_count: 5,
        waiting_holds: 2,
      },
    ],
    read: (store) => store.highDemand(),
    readError: (store) => store.highDemandError(),
    readPending: (store) => store.highDemandPending(),
  },
  {
    label: 'fine collection',
    method: 'loadFineCollection',
    rangeScoped: true,
    rows: [{ report_date: '2026-08-01', collected: 10, incurred: 15 }],
    read: (store) => store.fineCollection(),
    readError: (store) => store.fineCollectionError(),
    readPending: (store) => store.fineCollectionPending(),
  },
  {
    label: 'new member growth',
    method: 'loadNewMemberGrowth',
    rangeScoped: true,
    rows: [{ report_date: '2026-08-01', member_count: 2 }],
    read: (store) => store.newMemberGrowth(),
    readError: (store) => store.newMemberGrowthError(),
    readPending: (store) => store.newMemberGrowthPending(),
  },
  {
    label: 'peak hours',
    method: 'loadPeakHours',
    rangeScoped: true,
    rows: [{ hour_of_day: 9, checkout_count: 4 }],
    read: (store) => store.peakHours(),
    readError: (store) => store.peakHoursError(),
    readPending: (store) => store.peakHoursPending(),
  },
  {
    label: 'genre breakdown',
    method: 'loadGenreBreakdown',
    rangeScoped: true,
    rows: [{ genre: 'Sci-fi', checkout_count: 6 }],
    read: (store) => store.genreBreakdown(),
    readError: (store) => store.genreBreakdownError(),
    readPending: (store) => store.genreBreakdownPending(),
  },
];

/** Every metric answering with rows of its own, so a blank reads as a bug. */
function okRepo(): Record<string, ReturnType<typeof vi.fn>> {
  return Object.fromEntries(
    metrics.map((metric) => [
      metric.method,
      vi.fn().mockResolvedValue({ rows: metric.rows, error: null }),
    ]),
  );
}

function setup(repoOverrides: Record<string, unknown> = {}, reportRangeDays: number | null = 14) {
  TestBed.configureTestingModule({
    providers: [
      ReportsStore,
      {
        provide: AppSettingsService,
        useValue: {
          currency: () => 'EUR',
          reportRangeDays: () => reportRangeDays,
          load: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: ReportsRepository,
        useValue: { ...emptyRepo(), ...repoOverrides },
      },
    ],
  });
  return TestBed.inject(ReportsStore);
}

describe('ReportsStore', () => {
  it('initializes range and currency from AppSettings, then loads every metric', async () => {
    const loadOverdueAging = vi
      .fn()
      .mockResolvedValue({ rows: [{ bucket: '1-7', bucket_order: 1, loan_count: 3 }], error: null });
    const loadDeadStock = vi.fn().mockResolvedValue({ rows: [], error: null });
    const store = setup({ loadOverdueAging, loadDeadStock }, 30);

    await store.init();

    expect(store.currency()).toBe('EUR');
    expect(store.range()).toBe(30);
    expect(loadOverdueAging).toHaveBeenCalledWith();
    expect(loadDeadStock).toHaveBeenCalledWith(30);
    expect(store.overdueAging()).toEqual([{ bucket: '1-7', bucket_order: 1, loan_count: 3 }]);
    expect(store.totalOverdue()).toBe(3);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
    expect(store.overdueAgingError()).toBeNull();
  });

  it.each([null, 99])(
    'keeps the built-in 14-day default when the stored range is %o',
    async (stored) => {
      const store = setup({}, stored);

      await store.init();

      expect(store.range()).toBe(14);
    },
  );

  it('setRange reloads with the new range and is a no-op when unchanged', async () => {
    const loadDeadStock = vi.fn().mockResolvedValue({ rows: [], error: null });
    const store = setup({ loadDeadStock });
    await store.init();
    loadDeadStock.mockClear();

    await store.setRange(14);
    expect(loadDeadStock).not.toHaveBeenCalled();

    await store.setRange(7);
    expect(loadDeadStock).toHaveBeenCalledWith(7);
    expect(store.range()).toBe(7);
  });

  it('keeps a failed metric to itself — the other metrics still expose their rows', async () => {
    const store = setup({
      loadDeadStock: vi.fn().mockResolvedValue({ rows: [], error: 'load_failed' }),
      loadGenreBreakdown: vi
        .fn()
        .mockResolvedValue({ rows: [{ genre: 'Sci-fi', checkout_count: 5 }], error: null }),
    });

    await store.init();

    expect(store.deadStockError()).toBe('load_failed');
    expect(store.deadStock()).toEqual([]);
    // The card renders its alert, so it must not also read as still-loading.
    expect(store.deadStockPending()).toBe(false);
    expect(store.genreBreakdownError()).toBeNull();
    expect(store.genreBreakdown()).toEqual([{ genre: 'Sci-fi', checkout_count: 5 }]);
    // The aggregate stays true for the toast, but never blanks the healthy metrics.
    expect(store.error()).toBe('load_failed');
    expect(store.loading()).toBe(false);
  });

  it('surfaces a rejected metric read (e.g. a network-level failure) instead of throwing', async () => {
    const store = setup({ loadPeakHours: vi.fn().mockRejectedValue(new Error('network down')) });

    await expect(store.load()).resolves.toBeUndefined();

    expect(store.peakHoursError()).toBe('network down');
    expect(store.peakHours()).toEqual([]);
    expect(store.peakHoursLoading()).toBe(false);
    expect(store.loading()).toBe(false);
  });

  it('exposes loading per metric so one slow read does not hide the settled ones', async () => {
    let resolvePeakHours!: (value: { rows: PeakHoursRow[]; error: null }) => void;
    const loadPeakHours = vi.fn(
      () =>
        new Promise<{ rows: PeakHoursRow[]; error: null }>((resolve) => {
          resolvePeakHours = resolve;
        }),
    );
    const store = setup({ loadPeakHours });

    const init = store.init();
    await vi.waitFor(() => {
      expect(store.deadStockLoading()).toBe(false);
      expect(store.peakHoursLoading()).toBe(true);
    });
    expect(store.loading()).toBe(true);

    resolvePeakHours({ rows: [], error: null });
    await init;

    expect(store.peakHoursLoading()).toBe(false);
    expect(store.loading()).toBe(false);
  });

  it('ignores a superseded range response when the range changes twice in flight', async () => {
    let resolveFirst!: (value: { rows: GenreBreakdownRow[]; error: null }) => void;
    const loadGenreBreakdown = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ rows: GenreBreakdownRow[]; error: null }>((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ rows: [{ genre: 'Sci-fi', checkout_count: 5 }], error: null });
    const store = setup({ loadGenreBreakdown });

    const firstLoad = store.setRange(7);
    await vi.waitFor(() => {
      expect(loadGenreBreakdown).toHaveBeenCalledTimes(1);
    });
    const secondLoad = store.setRange(30);
    await vi.waitFor(() => {
      expect(loadGenreBreakdown).toHaveBeenCalledTimes(2);
    });
    resolveFirst({ rows: [{ genre: 'Fiction', checkout_count: 1 }], error: null });
    await Promise.all([firstLoad, secondLoad]);

    expect(store.range()).toBe(30);
    expect(store.genreBreakdown()).toEqual([{ genre: 'Sci-fi', checkout_count: 5 }]);
  });

  it('keeps the last good rows on screen while a range change is in flight', async () => {
    const genre = deferredMetric<GenreBreakdownRow>();
    const store = setup({ loadGenreBreakdown: genre.load });

    const init = store.init();
    await vi.waitFor(() => {
      expect(genre.load).toHaveBeenCalledTimes(1);
    });
    genre.resolve(0, { rows: [{ genre: 'Fiction', checkout_count: 1 }], error: null });
    await init;
    expect(store.genreBreakdown()).toEqual([{ genre: 'Fiction', checkout_count: 1 }]);

    const ranged = store.setRange(30);
    await vi.waitFor(() => {
      expect(genre.load).toHaveBeenCalledTimes(2);
    });

    // Mid-flight the card must keep its rows, not blank out to an empty chart.
    expect(store.genreBreakdown()).toEqual([{ genre: 'Fiction', checkout_count: 1 }]);
    expect(store.genreBreakdownPending()).toBe(false);
    expect(store.genreBreakdownLoading()).toBe(true);

    genre.resolve(1, { rows: [{ genre: 'Sci-fi', checkout_count: 5 }], error: null });
    await ranged;

    expect(store.genreBreakdown()).toEqual([{ genre: 'Sci-fi', checkout_count: 5 }]);
  });

  it('drops the previous rows when the new range fails, so the card shows its error', async () => {
    const loadDeadStock = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ title_id: 't1', title: 'Dune' }], error: null })
      .mockResolvedValueOnce({ rows: [], error: 'load_failed' });
    const store = setup({ loadDeadStock });

    await store.init();
    expect(store.deadStock()).toHaveLength(1);

    await store.setRange(30);

    expect(store.deadStockError()).toBe('load_failed');
    expect(store.deadStock()).toEqual([]);
  });

  it('marks a metric pending until its first read settles, so an empty card is never a guess', async () => {
    const deadStock = deferredMetric<DeadStockRow>();
    const store = setup({ loadDeadStock: deadStock.load });

    // Idle, before any load: the card has nothing to claim yet.
    expect(store.deadStockPending()).toBe(true);

    const init = store.init();
    await vi.waitFor(() => {
      expect(deadStock.load).toHaveBeenCalledTimes(1);
    });
    expect(store.deadStockPending()).toBe(true);

    deadStock.resolve(0, { rows: [], error: null });
    await init;

    // A settled empty result is a real answer, not a pending one.
    expect(store.deadStockPending()).toBe(false);
    expect(store.deadStock()).toEqual([]);
  });

  it('goes back to pending when a retry follows a failed metric, instead of reusing the blank', async () => {
    const deadStock = deferredMetric<DeadStockRow>();
    const store = setup({ loadDeadStock: deadStock.load });

    const init = store.init();
    await vi.waitFor(() => {
      expect(deadStock.load).toHaveBeenCalledTimes(1);
    });
    deadStock.resolve(0, { rows: [], error: 'load_failed' });
    await init;
    expect(store.deadStockError()).toBe('load_failed');
    expect(store.deadStockPending()).toBe(false);

    const retry = store.setRange(30);
    await vi.waitFor(() => {
      expect(deadStock.load).toHaveBeenCalledTimes(2);
    });

    // The failure left no value behind, so the retry knows nothing yet: the
    // card must show its placeholder, never an empty result it never received.
    expect(store.deadStockPending()).toBe(true);
    expect(store.deadStock()).toEqual([]);

    const row: DeadStockRow = {
      title_id: 't1',
      title: 'Dune',
      author: 'Herbert',
      genre: 'Sci-fi',
      lendable_copies: 1,
    };
    deadStock.resolve(1, { rows: [row], error: null });
    await retry;

    expect(store.deadStockPending()).toBe(false);
    expect(store.deadStock()).toEqual([row]);
  });

  it.each(metrics.flatMap((metric) => RANGE_DAYS_OPTIONS.map((range) => ({ ...metric, range }))))(
    '$label reads through $method at a $range-day range',
    async ({ method, rangeScoped, rows, read, readError, readPending, range }) => {
      const repo = okRepo();
      const store = setup(repo, range);

      await store.init();

      expect(repo[method]).toHaveBeenCalledWith(...(rangeScoped ? [range] : []));
      expect(read(store)).toEqual(rows);
      expect(readError(store)).toBeNull();
      expect(readPending(store)).toBe(false);
    },
  );

  it.each(metrics)(
    '$label re-reads on a range change, carrying the range only if it is scoped to one',
    async ({ method, rangeScoped, rows, read }) => {
      const repo = okRepo();
      const store = setup(repo, 14);
      await store.init();

      await store.setRange(30);

      expect(repo[method]).toHaveBeenCalledTimes(2);
      expect(repo[method]).toHaveBeenLastCalledWith(...(rangeScoped ? [30] : []));
      expect(read(store)).toEqual(rows);
    },
  );

  it.each(metrics)(
    '$label surfaces its own failure while every other metric keeps its rows',
    async (metric) => {
      const repo = {
        ...okRepo(),
        [metric.method]: vi.fn().mockResolvedValue({ rows: [], error: 'load_failed' }),
      };
      const store = setup(repo);

      await store.init();

      expect(metric.readError(store)).toBe('load_failed');
      expect(metric.read(store)).toEqual([]);
      for (const other of metrics.filter((m) => m.label !== metric.label)) {
        expect(other.readError(store), `${other.label} should be unaffected`).toBeNull();
        expect(other.read(store)).toEqual(other.rows);
      }
      expect(store.error()).toBe('load_failed');
    },
  );

  it('load() starts a fresh read even while the previous one is still in flight', async () => {
    const peakHours = deferredMetric<PeakHoursRow>();
    const store = setup({ loadPeakHours: peakHours.load });

    const init = store.init();
    await vi.waitFor(() => {
      expect(peakHours.load).toHaveBeenCalledTimes(1);
    });

    const refresh = store.load();
    await vi.waitFor(() => {
      expect(peakHours.load).toHaveBeenCalledTimes(2);
    });

    peakHours.resolve(0, { rows: [{ hour_of_day: 1, checkout_count: 1 }], error: null });
    peakHours.resolve(1, { rows: [{ hour_of_day: 9, checkout_count: 4 }], error: null });
    await Promise.all([init, refresh]);

    expect(store.peakHours()).toEqual([{ hour_of_day: 9, checkout_count: 4 }]);
  });
});
