import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../core/supabase';
import { CirculationRepository } from './circulation.repository';

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

describe('CirculationRepository', () => {
  it('finds a member by card barcode with member type rules', async () => {
    const fromCalls: string[] = [];
    const client = {
      from: (table: string) => {
        fromCalls.push(table);
        return createQueryBuilder(() => ({
          data: {
            id: 'm1',
            name: 'Ada',
            member_type_id: 't1',
            email: null,
            phone: null,
            avatar_url: null,
            status: 'active',
            joined_at: '2026-01-01T00:00:00Z',
            card_barcode: 'MBR-1001',
            created_at: '2026-01-01T00:00:00Z',
            member_type: {
              id: 't1',
              name: 'Adult',
              loan_period_days: 21,
              borrow_cap: 10,
            },
          },
          error: null,
        }));
      },
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.findMemberByCard('MBR-1001');

    expect(fromCalls).toEqual(['members']);
    expect(result.error).toBeNull();
    expect(result.row?.card_barcode).toBe('MBR-1001');
    expect(result.row?.member_type?.loan_period_days).toBe(21);
  });

  it('finds a copy by barcode with title fields', async () => {
    const client = {
      from: () =>
        createQueryBuilder(() => ({
          data: {
            id: 'c1',
            barcode: 'BK-DUNE-001',
            status: 'available',
            title_id: 't1',
            titles: { title: 'Dune', author: 'Herbert' },
          },
          error: null,
        })),
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.findCopyByBarcode('BK-DUNE-001');

    expect(result.error).toBeNull();
    expect(result.row).toEqual({
      id: 'c1',
      barcode: 'BK-DUNE-001',
      status: 'available',
      title_id: 't1',
      title: 'Dune',
      author: 'Herbert',
    });
  });

  it('maps checkout RPC gate errors to typed codes', async () => {
    const rpcCalls: unknown[] = [];
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: null, error: { message: 'member_suspended' } };
      },
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkout('m1', ['BK-001']);

    expect(rpcCalls).toEqual([
      { fn: 'checkout', args: { p_member_id: 'm1', p_copy_barcodes: ['BK-001'] } },
    ]);
    expect(result).toEqual({ ok: false, error: 'member_suspended' });
  });

  it('returns loans on successful checkout', async () => {
    const loan = {
      id: 'l1',
      copy_id: 'c1',
      member_id: 'm1',
      checked_out_by: 'p1',
      checked_out_at: '2026-08-01T00:00:00Z',
      due_at: '2026-08-22T00:00:00Z',
      returned_at: null,
      renew_count: 0,
      status: 'active',
      created_at: '2026-08-01T00:00:00Z',
    };
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async () => ({ data: [loan], error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkout('m1', ['BK-001']);

    expect(result).toEqual({ ok: true, loans: [loan] });
  });

  it('resolves an active loan by copy barcode with copy and member flattened', async () => {
    const eqCalls: [string, unknown][] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe('loans');
        const builder = createQueryBuilder(() => ({
          data: {
            id: 'l1',
            copy_id: 'c1',
            member_id: 'm1',
            checked_out_by: 'p1',
            checked_out_at: '2026-07-01T00:00:00Z',
            due_at: '2026-07-22T00:00:00Z',
            returned_at: null,
            renew_count: 0,
            status: 'active',
            created_at: '2026-07-01T00:00:00Z',
            copy: {
              id: 'c1',
              barcode: 'BK-100',
              status: 'on_loan',
              title_id: 't1',
              titles: { title: 'Dune', author: 'Herbert' },
            },
            member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
          },
          error: null,
        }));
        const originalEq = builder['eq'] as (c: string, v: unknown) => unknown;
        builder['eq'] = (column: string, value: unknown) => {
          eqCalls.push([column, value]);
          return originalEq(column, value);
        };
        return builder;
      },
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.findActiveLoanByBarcode('BK-100');

    expect(eqCalls).toEqual([
      ['status', 'active'],
      ['copy.barcode', 'BK-100'],
    ]);
    expect(result.error).toBeNull();
    expect(result.row).toEqual({
      loan: {
        id: 'l1',
        copy_id: 'c1',
        member_id: 'm1',
        checked_out_by: 'p1',
        checked_out_at: '2026-07-01T00:00:00Z',
        due_at: '2026-07-22T00:00:00Z',
        returned_at: null,
        renew_count: 0,
        status: 'active',
        created_at: '2026-07-01T00:00:00Z',
      },
      copy: {
        id: 'c1',
        barcode: 'BK-100',
        status: 'on_loan',
        title_id: 't1',
        title: 'Dune',
        author: 'Herbert',
      },
      member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
    });
  });

  it('reads the overdue projection from the overdue_loans view', async () => {
    const projection = {
      loan_id: 'l1',
      copy_id: 'c1',
      copy_barcode: 'BK-100',
      title_id: 't1',
      title: 'Dune',
      author: 'Herbert',
      member_id: 'm1',
      member_name: 'Ada',
      member_card_barcode: 'MBR-1',
      checked_out_at: '2026-07-01T00:00:00Z',
      due_at: '2026-07-22T00:00:00Z',
      days_late: 3,
      fine_rate_per_day: 0.25,
      projected_fine: 0.75,
    };
    const fromCalls: string[] = [];
    const client = {
      from: (table: string) => {
        fromCalls.push(table);
        return createQueryBuilder(() => ({ data: projection, error: null }));
      },
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.getOverdueProjection('l1');

    expect(fromCalls).toEqual(['overdue_loans']);
    expect(result.error).toBeNull();
    expect(result.row?.days_late).toBe(3);
    expect(result.row?.projected_fine).toBe(0.75);
  });

  it('maps the checkin RPC payload into a typed success', async () => {
    const payload = {
      loan: {
        id: 'l1',
        copy_id: 'c1',
        member_id: 'm1',
        checked_out_by: 'p1',
        checked_out_at: '2026-07-01T00:00:00Z',
        due_at: '2026-07-22T00:00:00Z',
        returned_at: '2026-08-01T10:00:00Z',
        renew_count: 0,
        status: 'returned',
        created_at: '2026-07-01T00:00:00Z',
      },
      copy_id: 'c1',
      barcode: 'BK-100',
      copy_status: 'available',
      condition: 'ok',
      days_late: 3,
      fines: [
        {
          id: 'f1',
          member_id: 'm1',
          loan_id: 'l1',
          reason: 'overdue',
          amount: 0.75,
          status: 'outstanding',
          accrual_rule_snapshot: { days_late: 3, fine_rate_per_day: 0.25 },
          created_at: '2026-08-01T10:00:00Z',
        },
      ],
      hold: null,
    };
    const rpcCalls: unknown[] = [];
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: payload, error: null };
      },
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkin('BK-100', 'ok');

    expect(rpcCalls).toEqual([
      { fn: 'checkin', args: { p_copy_barcode: 'BK-100', p_condition: 'ok' } },
    ]);
    expect(result).toEqual({
      ok: true,
      loan: payload.loan,
      copyStatus: 'available',
      condition: 'ok',
      daysLate: 3,
      fines: payload.fines,
      hold: null,
    });
  });

  it('passes the fill-hold choice to the checkin RPC and maps the readied hold', async () => {
    const payload = {
      loan: {
        id: 'l1',
        copy_id: 'c1',
        member_id: 'm1',
        checked_out_by: 'p1',
        checked_out_at: '2026-07-01T00:00:00Z',
        due_at: '2026-07-22T00:00:00Z',
        returned_at: '2026-08-01T10:00:00Z',
        renew_count: 0,
        status: 'returned',
        created_at: '2026-07-01T00:00:00Z',
      },
      copy_id: 'c1',
      barcode: 'BK-100',
      copy_status: 'on_hold_shelf',
      condition: 'ok',
      days_late: null,
      fines: [],
      hold: {
        id: 'h1',
        member_id: 'm2',
        member_name: 'Grace',
        copy_barcode: 'BK-100',
        expires_at: '2026-08-08T10:00:00Z',
      },
    };
    const rpcCalls: unknown[] = [];
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: payload, error: null };
      },
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkin('BK-100', 'ok', undefined, true);

    expect(rpcCalls).toEqual([
      {
        fn: 'checkin',
        args: { p_copy_barcode: 'BK-100', p_condition: 'ok', p_fill_hold: true },
      },
    ]);
    expect(result).toEqual({
      ok: true,
      loan: payload.loan,
      copyStatus: 'on_hold_shelf',
      condition: 'ok',
      daysLate: null,
      fines: [],
      hold: payload.hold,
    });
  });

  it('counts waiting holds for a title', async () => {
    const eqCalls: [string, unknown][] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe('holds');
        const builder = createQueryBuilder(() => ({ data: null, error: null, count: 3 }));
        const originalEq = builder['eq'] as (c: string, v: unknown) => unknown;
        builder['eq'] = (column: string, value: unknown) => {
          eqCalls.push([column, value]);
          return originalEq(column, value);
        };
        return builder;
      },
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.countWaitingHolds('t1');

    expect(eqCalls).toEqual([
      ['title_id', 't1'],
      ['status', 'waiting'],
    ]);
    expect(result).toEqual({ count: 3, error: null });
  });

  it('passes the damaged override amount to the checkin RPC', async () => {
    const rpcCalls: unknown[] = [];
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: null, error: { message: 'loan_not_found' } };
      },
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkin('BK-100', 'damaged', 7.5);

    expect(rpcCalls).toEqual([
      {
        fn: 'checkin',
        args: { p_copy_barcode: 'BK-100', p_condition: 'damaged', p_damaged_amount: 7.5 },
      },
    ]);
    expect(result).toEqual({ ok: false, error: 'loan_not_found' });
  });

  it('renews a loan via the renew_loan RPC and returns the updated row', async () => {
    const loan = {
      id: 'l1',
      copy_id: 'c1',
      member_id: 'm1',
      checked_out_by: 'p1',
      checked_out_at: '2026-07-01T00:00:00Z',
      due_at: '2026-08-22T00:00:00Z',
      returned_at: null,
      renew_count: 1,
      status: 'active',
      created_at: '2026-07-01T00:00:00Z',
    };
    const rpcCalls: unknown[] = [];
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: loan, error: null };
      },
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.renew('l1');

    expect(rpcCalls).toEqual([{ fn: 'renew_loan', args: { p_loan_id: 'l1' } }]);
    expect(result).toEqual({ ok: true, loan });
  });

  it('maps renew RPC gate errors to typed codes', async () => {
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async () => ({ data: null, error: { message: 'loan_overdue' } }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.renew('l1');

    expect(result).toEqual({ ok: false, error: 'loan_overdue' });
  });

  it('maps renew errors carrying the code in a longer message', async () => {
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async () => ({
        data: null,
        error: { message: 'renewal_limit_reached: raise exception' },
      }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.renew('l1');

    expect(result).toEqual({ ok: false, error: 'renewal_limit_reached' });
  });

  it('lists active and returned loans with copy and member flattened', async () => {
    const orderCalls: [string, { ascending: boolean }][] = [];
    const row = {
      id: 'l1',
      copy_id: 'c1',
      member_id: 'm1',
      checked_out_by: 'p1',
      checked_out_at: '2026-07-01T00:00:00Z',
      due_at: '2026-07-22T00:00:00Z',
      returned_at: null,
      renew_count: 0,
      status: 'active',
      created_at: '2026-07-01T00:00:00Z',
      copy: { id: 'c1', barcode: 'BK-100', titles: { title: 'Dune', author: 'Herbert' } },
      member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
    };
    const client = {
      from: () => {
        const builder = createQueryBuilder(() => ({ data: [row], error: null, count: 1 }));
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
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.listLoans('active', { page: 1, pageSize: 10 });

    expect(orderCalls).toEqual([['due_at', { ascending: true }]]);
    expect(result.error).toBeNull();
    expect(result.total).toBe(1);
    expect(result.rows[0]?.copy).toEqual({
      id: 'c1',
      barcode: 'BK-100',
      title: 'Dune',
      author: 'Herbert',
    });
    expect(result.rows[0]?.member).toEqual({ id: 'm1', name: 'Ada', card_barcode: 'MBR-1' });
  });

  it('lists overdue loans from the overdue_loans view, most days late first', async () => {
    const fromCalls: string[] = [];
    const orderCalls: [string, { ascending: boolean }][] = [];
    const client = {
      from: (table: string) => {
        fromCalls.push(table);
        const builder = createQueryBuilder(() => ({ data: [], error: null, count: 0 }));
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
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.listOverdue({ page: 2, pageSize: 10 });

    expect(fromCalls).toEqual(['overdue_loans']);
    expect(orderCalls).toEqual([
      ['days_late', { ascending: false }],
      ['due_at', { ascending: true }],
    ]);
    expect(result.error).toBeNull();
  });

  it('lists due-today loans from the due_today_loans view, earliest due first', async () => {
    const fromCalls: string[] = [];
    const orderCalls: [string, { ascending: boolean }][] = [];
    const client = {
      from: (table: string) => {
        fromCalls.push(table);
        const builder = createQueryBuilder(() => ({ data: [], error: null, count: 0 }));
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
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.listDueToday({ page: 1, pageSize: 5 });

    expect(fromCalls).toEqual(['due_today_loans']);
    expect(orderCalls).toEqual([['due_at', { ascending: true }]]);
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('reads the 14-day checkout trend, oldest day first', async () => {
    const fromCalls: string[] = [];
    const orderCalls: [string, { ascending: boolean }][] = [];
    const trend = [
      { day: '2026-07-21', checkouts: 0 },
      { day: '2026-07-22', checkouts: 2 },
    ];
    const client = {
      from: (table: string) => {
        fromCalls.push(table);
        const builder = createQueryBuilder(() => ({ data: trend, error: null }));
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
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.getCheckoutTrend();

    expect(fromCalls).toEqual(['checkout_trend']);
    expect(orderCalls).toEqual([['day', { ascending: true }]]);
    expect(result.error).toBeNull();
    expect(result.rows).toEqual(trend);
  });

  it('sums materialized balance and projected fines for the member panel', async () => {
    const inCalls: [string, unknown][] = [];
    const client = {
      from: (table: string) => {
        const builder =
          table === 'fines'
            ? createQueryBuilder(() => ({
                data: [
                  { amount: 10, amount_paid: 4 },
                  { amount: 5, amount_paid: 0 },
                ],
                error: null,
              }))
            : createQueryBuilder(() => ({
                data: [{ projected_fine: 0.75 }, { projected_fine: 0.25 }],
                error: null,
              }));
        const originalIn = builder['in'] as (c: string, v: unknown) => unknown;
        builder['in'] = (column: string, value: unknown) => {
          inCalls.push([column, value]);
          return originalIn(column, value);
        };
        return builder;
      },
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.getMemberMoney('m1');

    // Gate sum: materialized outstanding/partial fines only.
    expect(inCalls).toEqual([['status', ['outstanding', 'partial']]]);
    expect(result.error).toBeNull();
    expect(result.row).toEqual({ balance: 11, projected: 1 });
  });

  it('fails the money read when the fines query fails', async () => {
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: { message: 'boom' } })),
    };

    TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.getMemberMoney('m1');

    expect(result).toEqual({ row: null, error: 'boom' });
  });
});
