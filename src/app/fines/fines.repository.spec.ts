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
    'is',
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
  it("lists a member's fine history newest-first", async () => {
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
      loan: {
        id: 'l1',
        due_at: '2026-07-22T00:00:00Z',
        returned_at: '2026-08-01T00:00:00Z',
        copy: { id: 'c1', barcode: 'BK-100', titles: { title: 'Dune', author: 'Herbert' } },
      },
    };
    const fromCalls: string[] = [];
    const orderCalls: [string, { ascending: boolean }][] = [];
    const eqCalls: [string, unknown][] = [];
    const client = {
      from: (table: string) => {
        fromCalls.push(table);
        const builder = createQueryBuilder(() => ({ data: [row], error: null }));
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
    const result = await repo.listByMember('m1');

    expect(fromCalls).toEqual(['fines']);
    expect(eqCalls).toEqual([['member_id', 'm1']]);
    expect(orderCalls).toEqual([['created_at', { ascending: false }]]);
    expect(result.error).toBeNull();
    expect(result.rows[0]?.loan?.copy?.titles?.title).toBe('Dune');
  });

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

  it('reads desk totals from the fines_summary view', async () => {
    const client = {
      from: (table: string) => {
        expect(table).toBe('fines_summary');
        return createQueryBuilder(() => ({
          data: { outstanding_balance: 11, collected_total: 14, waived_total: 4 },
          error: null,
        }));
      },
    };

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.summary();

    expect(result.error).toBeNull();
    expect(result.row).toEqual({ outstandingBalance: 11, collectedTotal: 14, waivedTotal: 4 });
  });

  it('fails the summary when the view read fails', async () => {
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: { message: 'boom' } })),
    };

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.summary();

    expect(result).toEqual({ row: null, error: 'boom' });
  });

  it('lists payments oldest-first for a fine', async () => {
    const eqCalls: [string, unknown][] = [];
    const orderCalls: [string, { ascending: boolean }][] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe('payments');
        const builder = createQueryBuilder(() => ({ data: [], error: null }));
        const originalEq = builder['eq'] as (c: string, v: unknown) => unknown;
        builder['eq'] = (column: string, value: unknown) => {
          eqCalls.push([column, value]);
          return originalEq(column, value);
        };
        const originalOrder = builder['order'] as (
          c: string,
          o: { ascending: boolean },
        ) => unknown;
        builder['order'] = (column: string, options: { ascending: boolean }) => {
          orderCalls.push([column, options]);
          return originalOrder(column, options);
        };
        return builder;
      },
    };

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    await repo.listPayments('f1');

    expect(eqCalls).toEqual([['fine_id', 'f1']]);
    expect(orderCalls).toEqual([['created_at', { ascending: true }]]);
  });

  it('recordPayment calls the RPC and maps the receipt payload', async () => {
    const payload = {
      payment: { id: 'p1', fine_id: 'f1', amount: 4, method: 'cash' },
      fine: { id: 'f1', amount: 10, amount_paid: 4, status: 'partial' },
    };
    const rpc = vi.fn().mockResolvedValue({ data: payload, error: null });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.recordPayment('f1', 4, 'cash');

    expect(rpc).toHaveBeenCalledWith('record_payment', {
      p_fine_id: 'f1',
      p_amount: 4,
      p_method: 'cash',
    });
    expect(result).toEqual({ ok: true, receipt: payload });
  });

  it('recordPayment maps typed RPC errors', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'payment_exceeds_balance' } });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.recordPayment('f1', 99, 'cash');

    expect(result).toEqual({ ok: false, error: 'payment_exceeds_balance' });
  });

  it('waiveFine calls the RPC and returns the updated fine', async () => {
    const fine = { id: 'f1', status: 'waived', amount_paid: 2 };
    const rpc = vi.fn().mockResolvedValue({ data: fine, error: null });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.waiveFine('f1', 'goodwill');

    expect(rpc).toHaveBeenCalledWith('waive_fine', { p_fine_id: 'f1', p_reason: 'goodwill' });
    expect(result).toEqual({ ok: true, fine });
  });

  it('waiveFine maps the admin gate', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'admin_required' } });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.waiveFine('f1', 'goodwill');

    expect(result).toEqual({ ok: false, error: 'admin_required' });
  });

  it('voidPayment calls the RPC and maps the recomputed payload', async () => {
    const payload = {
      payment: { id: 'p1', fine_id: 'f1', amount: 4, voided_by: 'admin' },
      fine: { id: 'f1', amount: 10, amount_paid: 0, status: 'outstanding' },
    };
    const rpc = vi.fn().mockResolvedValue({ data: payload, error: null });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.voidPayment('p1', 'wrong amount');

    expect(rpc).toHaveBeenCalledWith('void_payment', {
      p_payment_id: 'p1',
      p_reason: 'wrong amount',
    });
    expect(result).toEqual({ ok: true, ...payload });
  });

  it('voidPayment maps typed RPC errors', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'payment_already_voided' } });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.voidPayment('p1', 'again');

    expect(result).toEqual({ ok: false, error: 'payment_already_voided' });
  });
});
