import { TestBed } from '@angular/core/testing';

import { AppSettingsService } from '../core/app-settings';
import { CirculationRepository } from './circulation.repository';
import { LoansStore } from './loans.store';
import type { LoanListItem } from './circulation.types';

const loanRow: LoanListItem = {
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
  copy: { id: 'c1', barcode: 'BK-100', title: 'Dune', author: 'Herbert' },
  member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
};

function setup(repoOverrides: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    providers: [
      LoansStore,
      {
        provide: AppSettingsService,
        useValue: {
          currency: () => 'EUR',
          load: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: CirculationRepository,
        useValue: {
          listLoans: vi.fn().mockResolvedValue({ rows: [], total: 0, error: null }),
          listOverdue: vi.fn().mockResolvedValue({ rows: [], total: 0, error: null }),
          renew: vi.fn().mockResolvedValue({ ok: true, loan: loanRow }),
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
    expect(store.currency()).toBe('EUR');
    expect(store.empty()).toBe(false);
  });

  it('switches to the overdue tab, which reads the overdue view', async () => {
    const listOverdue = vi
      .fn()
      .mockResolvedValue({ rows: [{ loan_id: 'l1', days_late: 3 }], total: 1, error: null });
    const store = setup({ listOverdue });
    await store.init();
    await store.setPage(2);

    await store.setTab('overdue');

    expect(listOverdue).toHaveBeenCalledWith({ page: 1, pageSize: 10 });
    expect(store.page()).toBe(1);
    expect(store.overdue()).toHaveLength(1);
  });

  it('switches to the returned tab and re-pages', async () => {
    const listLoans = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const store = setup({ listLoans });
    await store.init();

    await store.setTab('returned');
    expect(listLoans).toHaveBeenCalledWith('returned', { page: 1, pageSize: 10 });

    await store.setPage(3);
    expect(listLoans).toHaveBeenCalledWith('returned', { page: 3, pageSize: 10 });
  });

  it('clamps an out-of-range active page and reloads the last valid page', async () => {
    const listLoans = vi.fn((_tab, query: { page: number }) =>
      Promise.resolve(
        query.page === 2
          ? { rows: [], total: 1, error: null }
          : { rows: [loanRow], total: 1, error: null },
      ),
    );
    const store = setup({ listLoans });
    await store.init();

    await store.setPage(2);

    expect(listLoans).toHaveBeenLastCalledWith('active', { page: 1, pageSize: 10 });
    expect(store.loans()).toEqual([loanRow]);
  });

  it('surfaces load errors and empties the list', async () => {
    const listLoans = vi.fn().mockResolvedValue({ rows: [], total: 0, error: 'boom' });
    const store = setup({ listLoans });

    await store.init();

    expect(store.error()).toBe('load_failed');
    expect(store.loans()).toEqual([]);
    expect(store.empty()).toBe(false);
  });

  it('renews a loan and reloads so the new due date re-sorts the tab', async () => {
    const renewed = { ...loanRow, renew_count: 1, due_at: '2026-08-22T00:00:00Z' };
    const renew = vi.fn().mockResolvedValue({ ok: true, loan: renewed });
    const listLoans = vi.fn().mockResolvedValue({ rows: [renewed], total: 1, error: null });
    const store = setup({ renew, listLoans });
    await store.init();
    listLoans.mockClear();

    const result = await store.renew(loanRow);

    expect(renew).toHaveBeenCalledWith('l1');
    expect(result).toEqual({ ok: true, loan: renewed });
    expect(listLoans).toHaveBeenCalledWith('active', { page: 1, pageSize: 10 });
    expect(store.loans()[0]?.renew_count).toBe(1);
    expect(store.renewingId()).toBeNull();
  });

  it('returns the typed gate error without reloading', async () => {
    const renew = vi.fn().mockResolvedValue({ ok: false, error: 'title_has_waiting_holds' });
    const listLoans = vi.fn().mockResolvedValue({ rows: [loanRow], total: 1, error: null });
    const store = setup({ renew, listLoans });
    await store.init();
    listLoans.mockClear();

    const result = await store.renew(loanRow);

    expect(result).toEqual({ ok: false, error: 'title_has_waiting_holds' });
    expect(listLoans).not.toHaveBeenCalled();
    expect(store.renewingId()).toBeNull();
  });

  it('rejects a second renew while one is in flight', async () => {
    let resolveRenew: (value: { ok: true; loan: LoanListItem }) => void = () => {};
    const renew = vi.fn(
      () =>
        new Promise<{ ok: true; loan: LoanListItem }>((resolve) => {
          resolveRenew = resolve;
        }),
    );
    const store = setup({ renew });
    await store.init();

    const first = store.renew(loanRow);
    expect(store.renewingId()).toBe('l1');

    const second = await store.renew({ ...loanRow, id: 'l2' });
    expect(second).toEqual({ ok: false, error: 'unexpected' });
    expect(renew).toHaveBeenCalledTimes(1);

    resolveRenew({ ok: true, loan: loanRow });
    await first;
    expect(store.renewingId()).toBeNull();
  });
});
