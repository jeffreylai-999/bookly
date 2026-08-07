import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../core/supabase';
import { ReportsRepository } from './reports.repository';

describe('ReportsRepository', () => {
  it('loadAll calls every report RPC with the selected range (overdue aging excepted)', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });

    TestBed.configureTestingModule({
      providers: [ReportsRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    const repo = TestBed.inject(ReportsRepository);
    await repo.loadAll(7);

    expect(rpc).toHaveBeenCalledWith('report_overdue_aging');
    expect(rpc).toHaveBeenCalledWith('report_dead_stock', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_high_demand', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_fine_collection', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_new_member_growth', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_peak_hours', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_genre_breakdown', { p_days: 7 });
  });

  it('loadAll maps each RPC payload onto its named field', async () => {
    const rpc = vi.fn((fn: string) => {
      const rows: Record<string, unknown[]> = {
        report_overdue_aging: [{ bucket: '1-7', bucket_order: 1, loan_count: 2 }],
        report_dead_stock: [
          { title_id: 't1', title: 'Dune', author: 'Herbert', genre: 'Sci-fi', lendable_copies: 1 },
        ],
        report_high_demand: [
          { title_id: 't2', title: 'Beta', author: 'B', checkout_count: 3, waiting_holds: 1 },
        ],
        report_fine_collection: [{ report_date: '2026-08-01', collected: 5, incurred: 10 }],
        report_new_member_growth: [{ report_date: '2026-08-01', member_count: 2 }],
        report_peak_hours: [{ hour_of_day: 9, checkout_count: 4 }],
        report_genre_breakdown: [{ genre: 'Sci-fi', checkout_count: 6 }],
      };
      return Promise.resolve({ data: rows[fn], error: null });
    });

    TestBed.configureTestingModule({
      providers: [ReportsRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    const repo = TestBed.inject(ReportsRepository);
    const result = await repo.loadAll(14);

    expect(result.error).toBeNull();
    expect(result.data?.overdueAging).toEqual([{ bucket: '1-7', bucket_order: 1, loan_count: 2 }]);
    expect(result.data?.deadStock[0]?.title).toBe('Dune');
    expect(result.data?.highDemand[0]?.title).toBe('Beta');
    expect(result.data?.fineCollection[0]?.collected).toBe(5);
    expect(result.data?.newMemberGrowth[0]?.member_count).toBe(2);
    expect(result.data?.peakHours[0]?.hour_of_day).toBe(9);
    expect(result.data?.genreBreakdown[0]?.genre).toBe('Sci-fi');
  });

  it('loadAll surfaces the first RPC error and drops all data', async () => {
    const rpc = vi.fn((fn: string) => {
      if (fn === 'report_high_demand') {
        return Promise.resolve({ data: null, error: { message: 'boom' } });
      }
      return Promise.resolve({ data: [], error: null });
    });

    TestBed.configureTestingModule({
      providers: [ReportsRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
    });

    const repo = TestBed.inject(ReportsRepository);
    const result = await repo.loadAll(30);

    expect(result).toEqual({ data: null, error: 'boom' });
  });
});
