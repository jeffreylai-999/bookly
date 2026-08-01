import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../core/supabase';
import { FinesRepository } from './fines.repository';

type QueryResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

function createQueryBuilder(resolve: () => QueryResult | Promise<QueryResult>) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  for (const method of [
    'select',
    'insert',
    'update',
    'eq',
    'or',
    'ilike',
    'order',
    'range',
    'in',
    'limit',
    'maybeSingle',
    'single',
  ]) {
    builder[method] = () => self();
  }
  builder['then'] = (
    onfulfilled: (v: QueryResult) => unknown,
    onrejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolve()).then(onfulfilled, onrejected);
  return builder;
}

describe('FinesRepository', () => {
  it('lists fines newest-first with the member flattened', async () => {
    const row = {
      id: 'f1',
      member_id: 'm1',
      loan_id: 'l1',
      amount: 0.75,
      amount_paid: 0,
      reason: 'overdue',
      status: 'outstanding',
      accrual_rule_snapshot: { days_late: 3, fine_rate_per_day: 0.25 },
      created_at: '2026-08-01T10:00:00Z',
      member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
    };
    const orderCalls: [string, { ascending: boolean }][] = [];
    const eqCalls: [string, unknown][] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe('fines');
        const builder = createQueryBuilder(() => ({ data: [row], error: null, count: 1 }));
        const originalOrder = builder['order'] as (
          c: string,
          o: { ascending: boolean },
        ) => unknown;
        builder['order'] = (column: string, options: { ascending: boolean }) => {
          orderCalls.push([column, options]);
          return originalOrder(column, options);
        };
        const originalEq = builder['eq'] as (c: string, v: unknown) => unknown;
        builder['eq'] = (column: string, value: unknown) => {
          eqCalls.push([column, value]);
          return originalEq(column, value);
        };
        return builder;
      },
    };

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.list({ page: 1, pageSize: 10, status: 'all' });

    expect(orderCalls).toEqual([['created_at', { ascending: false }]]);
    expect(eqCalls).toEqual([]);
    expect(result.error).toBeNull();
    expect(result.total).toBe(1);
    expect(result.rows[0]?.member).toEqual({ id: 'm1', name: 'Ada', card_barcode: 'MBR-1' });
  });

  it('filters by status when one is selected', async () => {
    const eqCalls: [string, unknown][] = [];
    const client = {
      from: () => {
        const builder = createQueryBuilder(() => ({ data: [], error: null, count: 0 }));
        const originalEq = builder['eq'] as (c: string, v: unknown) => unknown;
        builder['eq'] = (column: string, value: unknown) => {
          eqCalls.push([column, value]);
          return originalEq(column, value);
        };
        return builder;
      },
    };

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    await repo.list({ page: 2, pageSize: 10, status: 'outstanding' });

    expect(eqCalls).toEqual([['status', 'outstanding']]);
  });

  it('reads the currency from the app_settings singleton', async () => {
    const client = {
      from: (table: string) => {
        expect(table).toBe('app_settings');
        return createQueryBuilder(() => ({ data: { currency: 'EUR' }, error: null }));
      },
    };

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.getCurrency();

    expect(result).toEqual({ currency: 'EUR', error: null });
  });
});
