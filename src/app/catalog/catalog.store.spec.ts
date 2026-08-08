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
    const listTitles = async () => ({ rows: [dune], total: 1, error: null });
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        {
          provide: CatalogRepository,
          useValue: {
            listTitles,
            listGenres: async () => ({ rows: ['Sci-fi', 'Fiction'], error: null }),
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
              return { rows: [], total: 0, error: null };
            },
            listGenres: async () => ({ rows: [], error: null }),
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
    expect(queries.at(-1)).toEqual(expect.objectContaining({ search: '', genre: '', page: 1 }));
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
              return { rows: listCalls === 1 ? [dune] : [updated], total: 1, error: null };
            },
            listGenres: async () => ({ rows: ['Sci-fi'], error: null }),
            addTitle: async () => ({ ok: true, value: dune }),
            editCopy: async () => ({ ok: true, value: dune.copies[0] }),
            setCopyStatus: async () => ({
              ok: true,
              value: {
                id: 'c1',
                barcode: 'BK-001',
                status: 'lost',
                title_id: 't1',
                created_at: '',
              },
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

  it('does not treat a load failure as an empty catalog', async () => {
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        {
          provide: CatalogRepository,
          useValue: {
            listTitles: async () => ({ rows: [], total: 0, error: 'network' }),
            listGenres: async () => ({ rows: [], error: null }),
            addTitle: async () => ({ ok: false, error: 'unexpected' }),
            editCopy: async () => ({ ok: false, error: 'unexpected' }),
            setCopyStatus: async () => ({ ok: false, error: 'unexpected' }),
          },
        },
      ],
    });

    const store = TestBed.inject(CatalogStore);
    await store.load();

    expect(store.error()).toBe('load_failed');
    expect(store.isEmpty()).toBe(false);
  });

  it('surfaces a genres load failure as load_failed', async () => {
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        {
          provide: CatalogRepository,
          useValue: {
            listTitles: async () => ({ rows: [dune], total: 1, error: null }),
            listGenres: async () => ({ rows: [], error: 'network' }),
            addTitle: async () => ({ ok: false, error: 'unexpected' }),
            editCopy: async () => ({ ok: false, error: 'unexpected' }),
            setCopyStatus: async () => ({ ok: false, error: 'unexpected' }),
          },
        },
      ],
    });

    const store = TestBed.inject(CatalogStore);
    await store.load();

    expect(store.error()).toBe('load_failed');
    expect(store.isEmpty()).toBe(false);
  });

  it('retains loaded genres when a later title load fails', async () => {
    let listCalls = 0;
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        {
          provide: CatalogRepository,
          useValue: {
            listTitles: async () => {
              listCalls += 1;
              if (listCalls > 1) {
                return { rows: [], total: 0, error: 'network' };
              }
              return { rows: [dune], total: 1, error: null };
            },
            listGenres: async () => ({ rows: ['Sci-fi', 'Fiction'], error: null }),
            addTitle: async () => ({ ok: false, error: 'unexpected' }),
            editCopy: async () => ({ ok: false, error: 'unexpected' }),
            setCopyStatus: async () => ({ ok: false, error: 'unexpected' }),
          },
        },
      ],
    });

    const store = TestBed.inject(CatalogStore);
    await store.load();
    await store.load();

    expect(store.rows()).toEqual([]);
    expect(store.total()).toBe(0);
    expect(store.genres()).toEqual(['Sci-fi', 'Fiction']);
    expect(store.error()).toBe('load_failed');
  });

  it('keeps a newer empty-search result when a stale slow search resolves', async () => {
    let slowLoaderStarted = false;
    const deferred: {
      resolve: (value: { rows: CatalogTitle[]; total: number; error: string | null }) => void;
    } = {
      resolve: () => undefined,
    };
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        {
          provide: CatalogRepository,
          useValue: {
            listTitles: async (q: { search: string }) => {
              if (q.search === 'slow') {
                slowLoaderStarted = true;
                return new Promise<{ rows: CatalogTitle[]; total: number; error: string | null }>(
                  (resolve) => {
                    deferred.resolve = resolve;
                  },
                );
              }
              return { rows: [dune], total: 1, error: null };
            },
            listGenres: async () => ({ rows: ['Sci-fi'], error: null }),
            addTitle: async () => ({ ok: false, error: 'unexpected' }),
            editCopy: async () => ({ ok: false, error: 'unexpected' }),
            setCopyStatus: async () => ({ ok: false, error: 'unexpected' }),
          },
        },
      ],
    });

    const store = TestBed.inject(CatalogStore);
    const slow = store.applySearch('slow');
    // Prove the slow request's loader actually began before it gets
    // superseded — otherwise "the stale request resolves without clobbering
    // the newer result" would be true for the trivial (and uninteresting)
    // reason that the slow request never ran at all.
    await vi.waitFor(() => expect(slowLoaderStarted).toBe(true));

    await store.applySearch('');
    deferred.resolve({ rows: [], total: 0, error: null });
    await slow;

    expect(store.rows()).toEqual([dune]);
    expect(store.total()).toBe(1);
  });

  it('keeps showing the previous result while a new page is still loading (sticky value)', async () => {
    let resolveSecond: (value: {
      rows: CatalogTitle[];
      total: number;
      error: string | null;
    }) => void = () => undefined;
    let calls = 0;
    TestBed.configureTestingModule({
      providers: [
        CatalogStore,
        {
          provide: CatalogRepository,
          useValue: {
            listTitles: async () => {
              calls += 1;
              if (calls === 1) {
                return { rows: [dune], total: 1, error: null };
              }
              return new Promise<{ rows: CatalogTitle[]; total: number; error: string | null }>(
                (resolve) => {
                  resolveSecond = resolve;
                },
              );
            },
            listGenres: async () => ({ rows: ['Sci-fi'], error: null }),
            addTitle: async () => ({ ok: false, error: 'unexpected' }),
            editCopy: async () => ({ ok: false, error: 'unexpected' }),
            setCopyStatus: async () => ({ ok: false, error: 'unexpected' }),
          },
        },
      ],
    });

    const store = TestBed.inject(CatalogStore);
    await store.load();
    expect(store.rows()).toEqual([dune]);

    const reload = store.applyPage(2);
    await vi.waitFor(() => expect(calls).toBe(2));
    expect(store.loading()).toBe(true);
    expect(store.rows()).toEqual([dune]);

    resolveSecond({ rows: [], total: 0, error: null });
    await reload;

    expect(store.rows()).toEqual([]);
  });
});
