import { TestBed } from '@angular/core/testing';

import { CirculationRepository } from './circulation.repository';
import { LoansStore } from './loans.store';

function setup(repoOverrides: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    providers: [
      LoansStore,
      {
        provide: CirculationRepository,
        useValue: {
          listLoans: vi.fn().mockResolvedValue({ rows: [], total: 0, error: null }),
          listOverdue: vi.fn().mockResolvedValue({ rows: [], total: 0, error: null }),
          ...repoOverrides,
        },
      },
    ],
  });
  return TestBed.inject(LoansStore);
}

describe('LoansStore', () => {
  it('loads the active tab on init', async () => {
    const listLoans = vi.fn().mockResolvedValue({ rows: [{ id: 'l1' }], total: 1, error: null });
    const store = setup({ listLoans });

    await store.init();

    expect(listLoans).toHaveBeenCalledWith('active', { page: 1, pageSize: 10 });
    expect(store.tab()).toBe('active');
    expect(store.loans()).toHaveLength(1);
    expect(store.total()).toBe(1);
    expect(store.empty()).toBe(false);
  });

  it('switches to the overdue tab, which reads the overdue view', async () => {
    const listOverdue = vi
      .fn()
      .mockResolvedValue({ rows: [{ loan_id: 'l1', days_late: 3 }], total: 1, error: null });
    const store = setup({ listOverdue });
    await store.init();
    store.setPage(2);

    store.setTab('overdue');
    await vi.waitFor(() => expect(store.loading()).toBe(false));

    expect(listOverdue).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(store.page()).toBe(1);
    expect(store.overdue()).toHaveLength(1);
  });

  it('switches to the returned tab and re-pages', async () => {
    const listLoans = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const store = setup({ listLoans });
    await store.init();

    store.setTab('returned');
    await vi.waitFor(() => expect(listLoans).toHaveBeenCalledWith('returned', {
      page: 1,
      pageSize: 10,
    }));

    store.setPage(3);
    await vi.waitFor(() => expect(listLoans).toHaveBeenCalledWith('returned', {
      page: 3,
      pageSize: 10,
    }));
  });

  it('surfaces load errors and empties the list', async () => {
    const listLoans = vi.fn().mockResolvedValue({ rows: [], total: 0, error: 'boom' });
    const store = setup({ listLoans });

    await store.init();

    expect(store.error()).toBe('boom');
    expect(store.loans()).toEqual([]);
    expect(store.empty()).toBe(false);
  });
});
