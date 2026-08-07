import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../supabase';
import { AppSettingsService } from './app-settings.service';

type SettingsRow = {
  currency: string;
  timezone: string;
  fine_block_threshold: number;
};

type QueryResult = { data: SettingsRow | null; error: { message: string } | null };

function createQueryBuilder(resolve: () => QueryResult) {
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

function setup(resolve: () => QueryResult) {
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
  it('loads currency, timezone, and fine block threshold from one app_settings read', async () => {
    const { service, from } = setup(() => ({
      data: {
        currency: 'EUR',
        timezone: 'Europe/Paris',
        fine_block_threshold: 25,
      },
      error: null,
    }));

    await service.load();

    expect(from).toHaveBeenCalledTimes(1);
    expect(service.currency()).toBe('EUR');
    expect(service.timezone()).toBe('Europe/Paris');
    expect(service.fineBlockThreshold()).toBe(25);
  });

  it('falls back to USD when currency is missing', async () => {
    const { service } = setup(() => ({
      data: {
        currency: '',
        timezone: 'America/New_York',
        fine_block_threshold: 10,
      },
      error: null,
    }));

    await service.load();

    expect(service.currency()).toBe('USD');
  });

  it('falls back to USD when the settings read fails', async () => {
    const { service } = setup(() => ({
      data: null,
      error: { message: 'boom' },
    }));

    await service.load();

    expect(service.currency()).toBe('USD');
    expect(service.timezone()).toBe('America/New_York');
    expect(service.fineBlockThreshold()).toBe(10);
  });

  it('falls back to USD when the stored currency code is malformed', async () => {
    const { service } = setup(() => ({
      data: {
        currency: 'us',
        timezone: 'America/Chicago',
        fine_block_threshold: 5,
      },
      error: null,
    }));

    await service.load();

    expect(service.currency()).toBe('USD');
    expect(service.timezone()).toBe('America/Chicago');
    expect(service.fineBlockThreshold()).toBe(5);
  });

  it('dedupes concurrent loads into a single read', async () => {
    const { service, from } = setup(() => ({
      data: {
        currency: 'GBP',
        timezone: 'Europe/London',
        fine_block_threshold: 15,
      },
      error: null,
    }));

    await Promise.all([service.load(), service.load()]);

    expect(from).toHaveBeenCalledTimes(1);
    expect(service.currency()).toBe('GBP');
  });
});
