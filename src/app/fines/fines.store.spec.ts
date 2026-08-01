import { TestBed } from '@angular/core/testing';

import { FinesRepository } from './fines.repository';
import { FinesStore } from './fines.store';

function setup(repoOverrides: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    providers: [
      FinesStore,
      {
        provide: FinesRepository,
        useValue: {
          list: vi.fn().mockResolvedValue({ rows: [], total: 0, error: null }),
          getCurrency: vi.fn().mockResolvedValue({ currency: 'EUR', error: null }),
          ...repoOverrides,
        },
      },
    ],
  });
  return TestBed.inject(FinesStore);
}

describe('FinesStore', () => {
  it('loads fines and the currency on init', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [{ id: 'f1' }], total: 1, error: null });
    const store = setup({ list });

    await store.init();

    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 10, status: 'all' });
    expect(store.currency()).toBe('EUR');
    expect(store.rows()).toHaveLength(1);
    expect(store.total()).toBe(1);
  });

  it('filters by status and resets the page', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const store = setup({ list });
    await store.init();
    store.setPage(2);

    store.setStatusFilter('outstanding');
    await vi.waitFor(() =>
      expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 10, status: 'outstanding' }),
    );

    expect(store.page()).toBe(1);
    expect(store.statusFilter()).toBe('outstanding');
  });

  it('keeps the default currency when the settings read fails', async () => {
    const store = setup({
      getCurrency: vi.fn().mockResolvedValue({ currency: 'USD', error: 'boom' }),
    });

    await store.init();

    expect(store.currency()).toBe('USD');
    expect(store.error()).toBeNull();
  });

  it('surfaces list errors', async () => {
    const store = setup({
      list: vi.fn().mockResolvedValue({ rows: [], total: 0, error: 'boom' }),
    });

    await store.init();

    expect(store.error()).toBe('boom');
    expect(store.rows()).toEqual([]);
  });
});
