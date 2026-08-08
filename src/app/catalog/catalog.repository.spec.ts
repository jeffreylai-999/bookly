import { TestBed } from '@angular/core/testing';

import {
  createPostgrestClientMock,
  createQueryBuilderMock,
} from '../core/postgrest/postgrest-access.testing';
import { SUPABASE_CLIENT } from '../core/supabase';
import { CatalogRepository } from './catalog.repository';

describe('CatalogRepository', () => {
  it('lists titles with availability counts from embedded copies', async () => {
    const builder = createQueryBuilderMock({
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
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CatalogRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CatalogRepository);
    const result = await repo.listTitles({ search: 'dune', genre: '', page: 1, pageSize: 10 });

    expect(client.from).toHaveBeenCalledWith('titles');
    expect(result.error).toBeNull();
    expect(result.total).toBe(1);
    expect(result.rows[0]?.availableCount).toBe(1);
    expect(result.rows[0]?.totalCount).toBe(3);
    expect(result.rows[0]?.title).toBe('Dune');
  });

  it('returns a list error instead of throwing when titles fail to load', async () => {
    const builder = createQueryBuilderMock({
      data: null,
      error: { message: 'network' },
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CatalogRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CatalogRepository);
    const result = await repo.listTitles({ search: '', genre: '', page: 1, pageSize: 10 });

    expect(result).toEqual({ rows: [], total: 0, error: 'network' });
  });

  it('maps unique ISBN failures on addTitle via add_title_with_copies', async () => {
    const client = createPostgrestClientMock({
      rpc: {
        data: null,
        error: {
          message: 'duplicate key value violates unique constraint "titles_isbn_unique"',
          code: '23505',
        },
      },
    });

    await TestBed.configureTestingModule({
      providers: [CatalogRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

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

    expect(client.rpc).toHaveBeenCalledWith(
      'add_title_with_copies',
      expect.objectContaining({
        p_title: 'Dune',
        p_barcodes: ['BK-001'],
      }),
    );
    expect(result).toEqual({ ok: false, error: 'isbn_taken' });
  });

  it('calls set_copy_status RPC and maps copy_on_loan', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: null, error: { message: 'copy_on_loan', code: 'P0001' } },
    });

    await TestBed.configureTestingModule({
      providers: [CatalogRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CatalogRepository);
    const result = await repo.setCopyStatus('c1', 'lost');

    expect(client.rpc).toHaveBeenCalledWith('set_copy_status', {
      p_copy_id: 'c1',
      p_status: 'lost',
    });
    expect(result).toEqual({ ok: false, error: 'copy_on_loan' });
  });
});
