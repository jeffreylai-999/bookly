import { TestBed } from '@angular/core/testing';

import { CheckinStore } from './checkin.store';
import { CirculationRepository } from './circulation.repository';
import type {
  CheckinCandidate,
  CheckinLookup,
  CheckinSuccess,
  OverdueLoan,
} from './circulation.types';

const lookup: CheckinLookup = {
  loan: {
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
  },
  copy: {
    id: 'c1',
    barcode: 'BK-100',
    status: 'on_loan',
    title_id: 't1',
    title: 'Dune',
    author: 'Herbert',
  },
  member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
};

const projection: OverdueLoan = {
  loan_id: 'l1',
  copy_id: 'c1',
  copy_barcode: 'BK-100',
  title_id: 't1',
  title: 'Dune',
  author: 'Herbert',
  member_id: 'm1',
  member_name: 'Ada',
  member_card_barcode: 'MBR-1',
  checked_out_at: '2026-07-01T00:00:00Z',
  due_at: '2026-07-22T00:00:00Z',
  days_late: 3,
  fine_rate_per_day: 0.25,
  projected_fine: 0.75,
};

const success: CheckinSuccess = {
  ok: true,
  loan: { ...lookup.loan, status: 'returned', returned_at: '2026-08-01T10:00:00Z' },
  copyStatus: 'available',
  condition: 'ok',
  daysLate: 3,
  fines: [],
};

function setup(repoOverrides: Record<string, unknown>) {
  TestBed.configureTestingModule({
    providers: [
      CheckinStore,
      {
        provide: CirculationRepository,
        useValue: {
          findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: null, error: null }),
          getOverdueProjection: vi.fn().mockResolvedValue({ row: null, error: null }),
          getSettings: vi.fn().mockResolvedValue({
            row: { currency: 'USD', damaged_fee_default: 10 },
            error: null,
          }),
          checkin: vi.fn(),
          ...repoOverrides,
        },
      },
    ],
  });
  return TestBed.inject(CheckinStore);
}

describe('CheckinStore', () => {
  it('resolves a scanned copy into a candidate with its overdue projection', async () => {
    const store = setup({
      findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: lookup, error: null }),
      getOverdueProjection: vi.fn().mockResolvedValue({ row: projection, error: null }),
    });

    const result = await store.selectCopyByBarcode('BK-100');

    expect(result.error).toBeNull();
    expect(store.candidate()?.copy.title).toBe('Dune');
    expect(store.projection()?.days_late).toBe(3);
    expect(store.projection()?.projected_fine).toBe(0.75);
    expect(store.condition()).toBe('ok');
    expect(store.damagedAmount()).toBe('10.00');
    expect(store.canConfirm()).toBe(true);
  });

  it('re-prefills the damaged default on each new scan', async () => {
    const checkin = vi.fn().mockResolvedValue(success);
    const store = setup({
      findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: lookup, error: null }),
      checkin,
    });
    await store.selectCopyByBarcode('BK-100');
    store.setDamagedAmount('7.50');

    await store.selectCopyByBarcode('BK-101');

    expect(store.damagedAmount()).toBe('10.00');

    // The edit flag resets too: an untouched prefill is not an override.
    store.setCondition('damaged');
    await store.confirm();
    expect(checkin).toHaveBeenCalledWith('BK-100', 'damaged', undefined);
  });

  it('sends no damaged amount when the prefill is untouched, so the RPC applies the live default', async () => {
    const checkin = vi.fn().mockResolvedValue(success);
    const store = setup({
      findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: lookup, error: null }),
      checkin,
    });
    await store.selectCopyByBarcode('BK-100');
    store.setCondition('damaged');

    const result = await store.confirm();

    expect(checkin).toHaveBeenCalledWith('BK-100', 'damaged', undefined);
    expect(result.ok).toBe(true);
  });

  it('reports loan_not_found when the copy has no active loan', async () => {
    const store = setup({});

    const result = await store.selectCopyByBarcode('BK-AVAIL');

    expect(result.error).toBe('loan_not_found');
    expect(store.candidate()).toBeNull();
    expect(store.canConfirm()).toBe(false);
  });

  it('keeps the scan usable when the settings read fails', async () => {
    const store = setup({
      findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: lookup, error: null }),
      getSettings: vi.fn().mockResolvedValue({ row: null, error: 'boom' }),
    });

    const result = await store.selectCopyByBarcode('BK-100');

    expect(result.error).toBeNull();
    expect(store.candidate()).not.toBeNull();
    expect(store.settings()).toBeNull();
    expect(store.damagedAmount()).toBe('');
  });

  it('gates confirm on a valid damaged amount', async () => {
    const store = setup({
      findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: lookup, error: null }),
    });
    await store.selectCopyByBarcode('BK-100');
    store.setCondition('damaged');

    store.setDamagedAmount('');
    expect(store.damagedAmountValid()).toBe(false);
    expect(store.canConfirm()).toBe(false);

    store.setDamagedAmount('-1');
    expect(store.damagedAmountValid()).toBe(false);

    store.setDamagedAmount('7.50');
    expect(store.damagedAmountValid()).toBe(true);
    expect(store.canConfirm()).toBe(true);

    store.setCondition('ok');
    expect(store.damagedAmountValid()).toBe(true);
  });

  it('rejects confirm with an invalid damaged amount without calling the RPC', async () => {
    const checkin = vi.fn();
    const store = setup({
      findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: lookup, error: null }),
      checkin,
    });
    await store.selectCopyByBarcode('BK-100');
    store.setCondition('damaged');
    store.setDamagedAmount('');

    const result = await store.confirm();

    expect(result).toEqual({ ok: false, error: 'invalid_damaged_amount' });
    expect(checkin).not.toHaveBeenCalled();
  });

  it('confirms damaged with the override amount and clears the candidate', async () => {
    const checkin = vi.fn().mockResolvedValue(success);
    const store = setup({
      findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: lookup, error: null }),
      checkin,
    });
    await store.selectCopyByBarcode('BK-100');
    store.setCondition('damaged');
    store.setDamagedAmount('7.50');

    const result = await store.confirm();

    expect(checkin).toHaveBeenCalledWith('BK-100', 'damaged', 7.5);
    expect(result.ok).toBe(true);
    expect(store.candidate()).toBeNull();
    expect(store.result()?.ok).toBe(true);
    expect(store.condition()).toBe('ok');
  });

  it('confirms ok without a damaged amount', async () => {
    const checkin = vi.fn().mockResolvedValue(success);
    const store = setup({
      findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: lookup, error: null }),
      checkin,
    });
    await store.selectCopyByBarcode('BK-100');

    const result = await store.confirm();

    expect(checkin).toHaveBeenCalledWith('BK-100', 'ok', undefined);
    expect(result.ok).toBe(true);
  });

  it('passes typed RPC errors through and keeps the candidate', async () => {
    const checkin = vi.fn().mockResolvedValue({ ok: false, error: 'loan_not_found' });
    const store = setup({
      findActiveLoanByBarcode: vi.fn().mockResolvedValue({ row: lookup, error: null }),
      checkin,
    });
    await store.selectCopyByBarcode('BK-100');

    const result = await store.confirm();

    expect(result).toEqual({ ok: false, error: 'loan_not_found' });
    expect(store.candidate()).not.toBeNull();
    expect(store.result()).toBeNull();
  });
});
