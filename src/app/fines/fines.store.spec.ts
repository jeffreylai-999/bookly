import { TestBed } from '@angular/core/testing';

import { AppSettingsService } from '../core/app-settings';
import { FinesRepository } from './fines.repository';
import { FinesStore } from './fines.store';
import type { FineListItem } from './fines.types';

const fineRow: FineListItem = {
  id: 'f1',
  member_id: 'm1',
  loan_id: 'l1',
  amount: 10,
  amount_paid: 4,
  reason: 'overdue',
  status: 'partial',
  accrual_rule_snapshot: {},
  created_at: '2026-08-01T10:00:00Z',
  member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
  loan: null,
};

const summaryRow = { outstandingBalance: 12, collectedTotal: 30, waivedTotal: 5 };

function setup(repoOverrides: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    providers: [
      FinesStore,
      {
        provide: AppSettingsService,
        useValue: {
          currency: () => 'EUR',
          load: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: FinesRepository,
        useValue: {
          list: vi.fn().mockResolvedValue({ rows: [], total: 0, error: null }),
          summary: vi.fn().mockResolvedValue({ row: summaryRow, error: null }),
          listPayments: vi.fn().mockResolvedValue({ rows: [], error: null }),
          recordPayment: vi.fn(),
          waiveFine: vi.fn(),
          voidPayment: vi.fn(),
          ...repoOverrides,
        },
      },
    ],
  });
  return TestBed.inject(FinesStore);
}

describe('FinesStore', () => {
  it('loads fines and the summary on init, reading currency from AppSettings', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [{ id: 'f1' }], total: 1, error: null });
    const summary = vi.fn().mockResolvedValue({ row: summaryRow, error: null });
    const store = setup({ list, summary });

    await store.init();

    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 10, status: 'all' });
    expect(summary).toHaveBeenCalled();
    expect(store.currency()).toBe('EUR');
    expect(store.rows()).toHaveLength(1);
    expect(store.total()).toBe(1);
    expect(store.summary()).toEqual(summaryRow);
  });

  it('filters by status and resets the page', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const store = setup({ list });
    await store.init();
    await store.setPage(2);

    await store.setStatusFilter('outstanding');

    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 10, status: 'outstanding' });
    expect(store.page()).toBe(1);
    expect(store.statusFilter()).toBe('outstanding');
  });

  it('reloads page 1 when a populated result makes the selected page out of range', async () => {
    const list = vi
      .fn()
      .mockImplementation(({ page }: { page: number }) =>
        Promise.resolve(
          page === 2
            ? { rows: [], total: 1, error: null }
            : { rows: [fineRow], total: 1, error: null },
        ),
      );
    const store = setup({ list });

    await store.setPage(2);

    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    expect(store.page()).toBe(1);
    expect(store.rows()).toEqual([fineRow]);
  });

  it('surfaces list errors', async () => {
    const store = setup({
      list: vi.fn().mockResolvedValue({ rows: [], total: 0, error: 'boom' }),
    });

    await store.init();

    expect(store.error()).toBe('load_failed');
    expect(store.rows()).toEqual([]);
  });

  it('surfaces summary errors without clobbering the list', async () => {
    const store = setup({
      summary: vi.fn().mockResolvedValue({ row: null, error: 'boom' }),
    });

    await store.init();

    expect(store.summaryError()).toBe('boom');
    expect(store.summary()).toBeNull();
    expect(store.error()).toBeNull();
  });

  it('openDetails loads the fine’s payments', async () => {
    const payment = { id: 'p1', fine_id: 'f1', amount: 4, method: 'cash' };
    const listPayments = vi.fn().mockResolvedValue({ rows: [payment], error: null });
    const store = setup({ listPayments });

    await store.openDetails(fineRow);

    expect(listPayments).toHaveBeenCalledWith('f1');
    expect(store.selectedFine()).toEqual(fineRow);
    expect(store.payments()).toEqual([payment]);
    expect(store.paymentsLoading()).toBe(false);
  });

  it('openDetails surfaces payments errors instead of a misleading empty state', async () => {
    const store = setup({
      listPayments: vi.fn().mockResolvedValue({ rows: [], error: 'boom' }),
    });

    await store.openDetails(fineRow);

    expect(store.paymentsError()).toBe('boom');
    expect(store.payments()).toEqual([]);
    expect(store.paymentsLoading()).toBe(false);
  });

  it('recordPayment stores the receipt and refreshes list + summary', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const summary = vi.fn().mockResolvedValue({ row: summaryRow, error: null });
    const receipt = {
      payment: { id: 'p1', fine_id: 'f1', amount: 4, method: 'cash' },
      fine: { ...fineRow, amount_paid: 8 },
    };
    const recordPayment = vi.fn().mockResolvedValue({ ok: true, receipt });
    const store = setup({ list, summary, recordPayment });
    await store.init();

    const result = await store.recordPayment('f1', 4, 'cash');

    expect(result).toEqual({ ok: true, receipt });
    expect(recordPayment).toHaveBeenCalledWith('f1', 4, 'cash');
    expect(store.receipt()).toEqual(receipt);
    expect(list).toHaveBeenCalledTimes(2);
    expect(summary).toHaveBeenCalledTimes(2);
  });

  it('recordPayment failure keeps state and reports the error', async () => {
    const recordPayment = vi.fn().mockResolvedValue({ ok: false, error: 'fine_already_paid' });
    const store = setup({ recordPayment });

    const result = await store.recordPayment('f1', 4, 'cash');

    expect(result).toEqual({ ok: false, error: 'fine_already_paid' });
    expect(store.receipt()).toBeNull();
    expect(store.busy()).toBe(false);
  });

  it('recordPayment updates an open detail view with the new fine state', async () => {
    const listPayments = vi.fn().mockResolvedValue({ rows: [], error: null });
    const receipt = {
      payment: { id: 'p1', fine_id: 'f1', amount: 4, method: 'cash' },
      fine: { ...fineRow, amount_paid: 8, status: 'partial' as const },
    };
    const store = setup({
      listPayments,
      recordPayment: vi.fn().mockResolvedValue({ ok: true, receipt }),
    });
    await store.openDetails(fineRow);

    await store.recordPayment('f1', 4, 'cash');

    expect(store.selectedFine()?.amount_paid).toBe(8);
    expect(listPayments).toHaveBeenCalledTimes(2);
  });

  it('waiveFine refreshes list + summary without touching the receipt', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const summary = vi.fn().mockResolvedValue({ row: summaryRow, error: null });
    const waiveFine = vi
      .fn()
      .mockResolvedValue({ ok: true, fine: { ...fineRow, status: 'waived' } });
    const store = setup({ list, summary, waiveFine });
    await store.init();

    const result = await store.waiveFine('f1', 'goodwill');

    expect(result.ok).toBe(true);
    expect(waiveFine).toHaveBeenCalledWith('f1', 'goodwill');
    expect(store.receipt()).toBeNull();
    expect(list).toHaveBeenCalledTimes(2);
    expect(summary).toHaveBeenCalledTimes(2);
  });

  it('voidPayment refreshes list + summary', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const summary = vi.fn().mockResolvedValue({ row: summaryRow, error: null });
    const voidPayment = vi.fn().mockResolvedValue({
      ok: true,
      payment: { id: 'p1', fine_id: 'f1', amount: 4, voided_by: 'admin' },
      fine: { ...fineRow, amount_paid: 0, status: 'outstanding' },
    });
    const store = setup({ list, summary, voidPayment });
    await store.init();

    const result = await store.voidPayment('p1', 'wrong amount');

    expect(result.ok).toBe(true);
    expect(voidPayment).toHaveBeenCalledWith('p1', 'wrong amount');
    expect(list).toHaveBeenCalledTimes(2);
    expect(summary).toHaveBeenCalledTimes(2);
  });

  it('closeDetails clears the selection and payments', async () => {
    const store = setup();
    await store.openDetails(fineRow);

    store.closeDetails();

    expect(store.selectedFine()).toBeNull();
    expect(store.payments()).toEqual([]);
    expect(store.paymentsError()).toBeNull();
  });
});
