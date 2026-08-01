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
});
