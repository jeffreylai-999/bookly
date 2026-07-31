import { TestBed } from '@angular/core/testing';

import { CatalogRepository } from './catalog.repository';
import { CatalogStore } from './catalog.store';
import type { CatalogTitle } from './catalog.types';

const dune: CatalogTitle = {
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
  ],
  availableCount: 1,
  totalCount: 2,
};

describe('CatalogStore', () => {
  it('loads titles and exposes result count', async () => {
    const listTitles = async () => ({ rows: [dune], total: 1 });
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        {
          provide: CatalogRepository,
          useValue: {
            listTitles,
            listGenres: async () => ['Sci-fi', 'Fiction'],
            addTitle: async () => ({ ok: true, value: dune }),
            editCopy: async () => ({ ok: true, value: dune.copies[0] }),
            setCopyStatus: async () => ({ ok: true, value: dune.copies[0] }),
          },
        },
      ],
    });

    const store = TestBed.inject(CatalogStore);
    await store.load();

    expect(store.rows()).toEqual([dune]);
    expect(store.total()).toBe(1);
    expect(store.genres()).toEqual(['Sci-fi', 'Fiction']);
    expect(store.hasActiveFilters()).toBe(false);
  });

  it('clearFilters resets search and genre then reloads', async () => {
    const queries: unknown[] = [];
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        {
          provide: CatalogRepository,
          useValue: {
            listTitles: async (q: unknown) => {
              queries.push(q);
              return { rows: [], total: 0 };
            },
            listGenres: async () => [],
            addTitle: async () => ({ ok: false, error: 'unexpected' }),
            editCopy: async () => ({ ok: false, error: 'unexpected' }),
            setCopyStatus: async () => ({ ok: false, error: 'unexpected' }),
          },
        },
      ],
    });

    const store = TestBed.inject(CatalogStore);
    store.setSearch('dune');
    store.setGenre('Sci-fi');
    await store.clearFilters();

    expect(store.search()).toBe('');
    expect(store.genre()).toBe('');
    expect(store.hasActiveFilters()).toBe(false);
    expect(queries.at(-1)).toEqual(
      expect.objectContaining({ search: '', genre: '', page: 1 }),
    );
  });

  it('setCopyStatus refreshes availability after success', async () => {
    const updated = {
      ...dune,
      copies: [
        { id: 'c1', barcode: 'BK-001', status: 'lost' as const },
        { id: 'c2', barcode: 'BK-002', status: 'on_loan' as const },
      ],
      availableCount: 0,
      totalCount: 2,
    };
    let listCalls = 0;
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        {
          provide: CatalogRepository,
          useValue: {
            listTitles: async () => {
              listCalls += 1;
              return { rows: listCalls === 1 ? [dune] : [updated], total: 1 };
            },
            listGenres: async () => ['Sci-fi'],
            addTitle: async () => ({ ok: true, value: dune }),
            editCopy: async () => ({ ok: true, value: dune.copies[0] }),
            setCopyStatus: async () => ({
              ok: true,
              value: { id: 'c1', barcode: 'BK-001', status: 'lost', title_id: 't1', created_at: '' },
            }),
          },
        },
      ],
    });

    const store = TestBed.inject(CatalogStore);
    await store.load();
    const result = await store.setCopyStatus('c1', 'lost');

    expect(result).toEqual({ ok: true });
    expect(store.rows()[0]?.availableCount).toBe(0);
  });
});
