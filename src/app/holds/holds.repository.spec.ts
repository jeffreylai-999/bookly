import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../core/supabase';
import { HoldsRepository } from './holds.repository';

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

const holdRow = {
  id: 'h1',
  title_id: 't1',
  member_id: 'm1',
  queue_position: 1,
  status: 'waiting',
  copy_id: null,
  ready_at: null,
  expires_at: null,
  created_at: '2026-07-20T00:00:00Z',
  title: { title: 'Dune', author: 'Herbert' },
  member: { name: 'Ada', card_barcode: 'MBR-1' },
  copy: null,
};

describe('HoldsRepository', () => {
  it('lists holds oldest first with title, member, and copy joined', async () => {
    const orderCalls: [string, { ascending: boolean }][] = [];
    const eqCalls: [string, unknown][] = [];
    const client = {
      from: (table: string) => {
        expect(table).toBe('holds');
        const builder = createQueryBuilder(() => ({ data: [holdRow], error: null, count: 1 }));
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
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.listHolds('waiting', { page: 1, pageSize: 10 });

    expect(orderCalls).toEqual([['created_at', { ascending: true }]]);
    expect(eqCalls).toEqual([['status', 'waiting']]);
    expect(result.error).toBeNull();
    expect(result.total).toBe(1);
    expect(result.rows[0]?.title?.title).toBe('Dune');
    expect(result.rows[0]?.member?.name).toBe('Ada');
  });

  it('skips the status filter for the all option', async () => {
    let eqCalled = false;
    const client = {
      from: () => {
        const builder = createQueryBuilder(() => ({ data: [], error: null, count: 0 }));
        builder['eq'] = () => {
          eqCalled = true;
          return builder;
        };
        return builder;
      },
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    await repo.listHolds('', { page: 1, pageSize: 10 });

    expect(eqCalled).toBe(false);
  });

  it("lists a member's holds oldest first with title and copy joined", async () => {
    const fromCalls: string[] = [];
    const orderCalls: [string, { ascending: boolean }][] = [];
    const eqCalls: [string, unknown][] = [];
    const client = {
      from: (table: string) => {
        fromCalls.push(table);
        const builder = createQueryBuilder(() => ({ data: [holdRow], error: null }));
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
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.listByMember('m1');

    expect(fromCalls).toEqual(['holds']);
    expect(eqCalls).toEqual([['member_id', 'm1']]);
    expect(orderCalls).toEqual([['created_at', { ascending: true }]]);
    expect(result.error).toBeNull();
    expect(result.rows[0]?.title?.title).toBe('Dune');
  });

  it('marks ready with the title and copy barcode — never a hold id', async () => {
    const rpcCalls: unknown[] = [];
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: { ...holdRow, status: 'ready' }, error: null };
      },
    };

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.markReady('t1', ' BK-001 ');

    expect(rpcCalls).toEqual([
      { fn: 'mark_ready', args: { p_title_id: 't1', p_copy_barcode: 'BK-001' } },
    ]);
    expect(result).toEqual({ ok: true, hold: { ...holdRow, status: 'ready' } });
  });

  it('maps mark_ready RPC errors to typed codes', async () => {
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async () => ({ data: null, error: { message: 'copy_not_available' } }),
    };

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.markReady('t1', 'BK-001');

    expect(result).toEqual({ ok: false, error: 'copy_not_available' });
  });

  it('cancels a hold by id', async () => {
    const rpcCalls: unknown[] = [];
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: { ...holdRow, status: 'cancelled' }, error: null };
      },
    };

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.cancelHold('h1');

    expect(rpcCalls).toEqual([{ fn: 'cancel_hold', args: { p_hold_id: 'h1' } }]);
    expect(result).toEqual({ ok: true });
  });
});
