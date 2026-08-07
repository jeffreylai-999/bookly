import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../supabase';
import { AppSettingsService } from './app-settings.service';

type SettingsRow = {
  currency: string | null;
  default_report_range_days: number | null;
};

type QueryResult = { data: SettingsRow | null; error: { message: string } | null };

function createQueryBuilder(resolve: () => QueryResult | Promise<QueryResult>) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  for (const method of ['select', 'eq', 'single']) {
    builder[method] = () => self();
  }
  builder['then'] = (
    onfulfilled: (v: QueryResult) => unknown,
    onrejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolve()).then(onfulfilled, onrejected);
  return builder;
}

function setup(resolve: () => QueryResult | Promise<QueryResult>) {
  const from = vi.fn((table: string) => {
    expect(table).toBe('app_settings');
    return createQueryBuilder(resolve);
  });

  TestBed.configureTestingModule({
    providers: [AppSettingsService, { provide: SUPABASE_CLIENT, useValue: { from } }],
  });

  return { service: TestBed.inject(AppSettingsService), from };
}

describe('AppSettingsService', () => {
  it('loads currency and the report range default from one app_settings read', async () => {
    const { service, from } = setup(() => ({
      data: { currency: 'EUR', default_report_range_days: 30 },
      error: null,
    }));

    await service.load();

    expect(from).toHaveBeenCalledTimes(1);
    expect(service.currency()).toBe('EUR');
    expect(service.reportRangeDays()).toBe(30);
  });

  it.each(['', null, 'us', 'usd'])('falls back to USD for the currency code %o', async (code) => {
    const { service } = setup(() => ({
      data: { currency: code, default_report_range_days: 7 },
      error: null,
    }));

    await service.load();

    expect(service.currency()).toBe('USD');
    expect(service.reportRangeDays()).toBe(7);
  });

  it('keeps defaults and retries on the next call when the read fails', async () => {
    let result: QueryResult = { data: null, error: { message: 'boom' } };
    const { service, from } = setup(() => result);

    await service.load();

    expect(service.currency()).toBe('USD');
    expect(service.reportRangeDays()).toBeNull();

    result = { data: { currency: 'GBP', default_report_range_days: 14 }, error: null };
    await service.load();

    expect(from).toHaveBeenCalledTimes(2);
    expect(service.currency()).toBe('GBP');
  });

  it('dedupes concurrent loads into a single read', async () => {
    const { service, from } = setup(() => ({
      data: { currency: 'GBP', default_report_range_days: 15 },
      error: null,
    }));

    await Promise.all([service.load(), service.load()]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(service.currency()).toBe('GBP');
  });

  it('set() refreshes the cache so a later load does not refetch', async () => {
    const { service, from } = setup(() => ({
      data: { currency: 'EUR', default_report_range_days: 30 },
      error: null,
    }));

    service.set({ currency: 'JPY', default_report_range_days: 7 });
    await service.load();

    expect(from).not.toHaveBeenCalled();
    expect(service.currency()).toBe('JPY');
    expect(service.reportRangeDays()).toBe(7);
  });

  it('ignores a late fetch after set() writes a fresher row', async () => {
    let resolveFetch!: (value: QueryResult) => void;
    const pending = new Promise<QueryResult>((resolve) => {
      resolveFetch = resolve;
    });
    const { service } = setup(() => pending);

    const loadPromise = service.load();
    service.set({ currency: 'JPY', default_report_range_days: 7 });
    resolveFetch({ data: { currency: 'EUR', default_report_range_days: 30 }, error: null });
    await loadPromise;

    expect(service.currency()).toBe('JPY');
    expect(service.reportRangeDays()).toBe(7);
  });
});
