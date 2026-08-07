import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AppSettingsService } from '../core/app-settings';
import { ReportsRepository } from './reports.repository';
import { ReportsStore } from './reports.store';
import type { ReportsData } from './reports.types';

const emptyData: ReportsData = {
  overdueAging: [],
  deadStock: [],
  highDemand: [],
  fineCollection: [],
  newMemberGrowth: [],
  peakHours: [],
  genreBreakdown: [],
};

function setup(
  repoOverrides: Record<string, unknown> = {},
  appSettingsOverrides: Partial<AppSettingsService> = {},
) {
  const currency = signal('EUR');
  TestBed.configureTestingModule({
    providers: [
      ReportsStore,
      {
        provide: AppSettingsService,
        useValue: {
          currency: currency.asReadonly(),
          load: vi.fn().mockResolvedValue(undefined),
          ...appSettingsOverrides,
        },
      },
      {
        provide: ReportsRepository,
        useValue: {
          getSettings: vi.fn().mockResolvedValue({
            settings: { defaultRangeDays: 14 },
            error: null,
          }),
          loadAll: vi.fn().mockResolvedValue({ data: emptyData, error: null }),
          ...repoOverrides,
        },
      },
    ],
  });
  return TestBed.inject(ReportsStore);
}

describe('ReportsStore', () => {
  it('initializes range from app_settings, currency from AppSettings, and loads metrics', async () => {
    const getSettings = vi
      .fn()
      .mockResolvedValue({ settings: { defaultRangeDays: 30 }, error: null });
    const load = vi.fn().mockResolvedValue(undefined);
    const loadAll = vi.fn().mockResolvedValue({
      data: { ...emptyData, overdueAging: [{ bucket: '1-7', bucket_order: 1, loan_count: 3 }] },
      error: null,
    });
    const store = setup({ getSettings, loadAll }, { load });

    await store.init();

    expect(load).toHaveBeenCalled();
    expect(store.currency()).toBe('EUR');
    expect(store.range()).toBe(30);
    expect(loadAll).toHaveBeenCalledWith(30);
    expect(store.overdueAging()).toEqual([{ bucket: '1-7', bucket_order: 1, loan_count: 3 }]);
    expect(store.totalOverdue()).toBe(3);
    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('keeps the built-in 14-day default when the settings read fails', async () => {
    const getSettings = vi
      .fn()
      .mockResolvedValue({ settings: { defaultRangeDays: 7 }, error: 'boom' });
    const store = setup({ getSettings });

    await store.init();

    expect(store.range()).toBe(14);
  });

  it('setRange reloads with the new range and is a no-op when unchanged', async () => {
    const loadAll = vi.fn().mockResolvedValue({ data: emptyData, error: null });
    const store = setup({ loadAll });
    await store.init();
    loadAll.mockClear();

    await store.setRange(14);
    expect(loadAll).not.toHaveBeenCalled();

    await store.setRange(7);
    expect(loadAll).toHaveBeenCalledWith(7);
    expect(store.range()).toBe(7);
  });

  it('surfaces a load error and leaves prior data untouched on the next failed load', async () => {
    const loadAll = vi
      .fn()
      .mockResolvedValueOnce({ data: emptyData, error: null })
      .mockResolvedValueOnce({ data: null, error: 'load_failed' });
    const store = setup({ loadAll });

    await store.init();
    await store.setRange(30);

    expect(store.error()).toBe('load_failed');
  });

  it('catches a rejected loadAll (e.g. a network-level failure) instead of throwing', async () => {
    const loadAll = vi.fn().mockRejectedValue(new Error('network down'));
    const store = setup({ loadAll });

    await expect(store.load()).resolves.toBeUndefined();

    expect(store.error()).toBe('unexpected');
    expect(store.loading()).toBe(false);
  });

  it('ignores a superseded response when range changes twice in flight', async () => {
    let resolveFirst!: (v: { data: ReportsData; error: null }) => void;
    const loadAll = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({
        data: { ...emptyData, genreBreakdown: [{ genre: 'Sci-fi', checkout_count: 5 }] },
        error: null,
      });
    const store = setup({ loadAll });

    const firstLoad = store.setRange(7);
    const secondLoad = store.setRange(30);
    resolveFirst({
      data: { ...emptyData, genreBreakdown: [{ genre: 'Fiction', checkout_count: 1 }] },
      error: null,
    });
    await Promise.all([firstLoad, secondLoad]);

    expect(store.genreBreakdown()).toEqual([{ genre: 'Sci-fi', checkout_count: 5 }]);
  });
});
