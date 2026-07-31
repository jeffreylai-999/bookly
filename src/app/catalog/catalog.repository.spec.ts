import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../core/supabase';
import { CatalogRepository } from './catalog.repository';

type QueryResult = { data: unknown; error: { message: string; code?: string } | null; count?: number | null };

/**
 * Chainable PostgREST mock. Call sites configure the terminal result via
 * `resolve`. Methods return `this` so `.select().eq().range()` works.
 */
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
  ]) {
    builder[method] = () => self();
  }
  builder['then'] = (
    onfulfilled: (v: QueryResult) => unknown,
    onrejected?: (e: unknown) => unknown,
  ) => Promise.resolve(resolve()).then(onfulfilled, onrejected);
  return builder;
}

describe('CatalogRepository', () => {
  it('lists titles with availability counts from embedded copies', async () => {
    const fromCalls: string[] = [];
    const client = {
      from: (table: string) => {
        fromCalls.push(table);
        return createQueryBuilder(() => ({
          data: [
            {
              id: 't1',
              title: 'Dune',
              author: 'Herbert',
              genre: 'Sci-fi',
              isbn: '9780441172719',
              description: null,
              replacement_cost: 20,
              created_at: '2026-01-01T00:00:00Z',
              copies: [
                { id: 'c1', barcode: 'BK-001', status: 'available' },
                { id: 'c2', barcode: 'BK-002', status: 'on_loan' },
                { id: 'c3', barcode: 'BK-003', status: 'lost' },
              ],
            },
          ],
          error: null,
          count: 1,
        }));
      },
      rpc: async () => ({ data: null, error: null }),
    };

    TestBed.configureTestingModule({
      providers: [CatalogRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CatalogRepository);
    const result = await repo.listTitles({ search: 'dune', genre: '', page: 1, pageSize: 10 });

    expect(fromCalls).toEqual(['titles']);
    expect(result.total).toBe(1);
    expect(result.rows[0]?.availableCount).toBe(1);
    expect(result.rows[0]?.totalCount).toBe(3);
    expect(result.rows[0]?.title).toBe('Dune');
  });

  it('maps unique ISBN failures on addTitle via add_title_with_copies', async () => {
    const rpcCalls: unknown[] = [];
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return {
          data: null,
          error: {
            message: 'duplicate key value violates unique constraint "titles_isbn_unique"',
            code: '23505',
          },
        };
      },
    };

    TestBed.configureTestingModule({
      providers: [CatalogRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CatalogRepository);
    const result = await repo.addTitle({
      title: 'Dune',
      author: 'Herbert',
      genre: 'Sci-fi',
      isbn: '9780441172719',
      description: null,
      replacement_cost: null,
      barcodes: ['BK-001'],
    });

    expect(rpcCalls[0]).toEqual({
      fn: 'add_title_with_copies',
      args: expect.objectContaining({
        p_title: 'Dune',
        p_barcodes: ['BK-001'],
      }),
    });
    expect(result).toEqual({ ok: false, error: 'isbn_taken' });
  });

  it('calls set_copy_status RPC and maps copy_on_loan', async () => {
    const rpcCalls: unknown[] = [];
    const client = {
      from: () => createQueryBuilder(() => ({ data: null, error: null })),
      rpc: async (fn: string, args: unknown) => {
        rpcCalls.push({ fn, args });
        return { data: null, error: { message: 'copy_on_loan', code: 'P0001' } };
      },
    };

    TestBed.configureTestingModule({
      providers: [CatalogRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(CatalogRepository);
    const result = await repo.setCopyStatus('c1', 'lost');

    expect(rpcCalls).toEqual([
      { fn: 'set_copy_status', args: { p_copy_id: 'c1', p_status: 'lost' } },
    ]);
    expect(result).toEqual({ ok: false, error: 'copy_on_loan' });
  });
});
