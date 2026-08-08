import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../core/supabase';
import { ReportsRepository } from './reports.repository';

function setup(rpc: (fn: string, args?: unknown) => Promise<unknown>) {
  TestBed.configureTestingModule({
    providers: [ReportsRepository, { provide: SUPABASE_CLIENT, useValue: { rpc } }],
  });
  return TestBed.inject(ReportsRepository);
}

const ROWS: Record<string, unknown[]> = {
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

describe('ReportsRepository', () => {
  it('reads each metric from its own RPC, passing the range to the range-scoped ones', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    const repo = setup(rpc);

    await Promise.all([
      repo.loadOverdueAging(),
      repo.loadDeadStock(7),
      repo.loadHighDemand(7),
      repo.loadFineCollection(7),
      repo.loadNewMemberGrowth(7),
      repo.loadPeakHours(7),
      repo.loadGenreBreakdown(7),
    ]);

    // Overdue aging is a present-state snapshot, so it takes no range (spec §7).
    expect(rpc).toHaveBeenCalledWith('report_overdue_aging');
    expect(rpc).toHaveBeenCalledWith('report_dead_stock', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_high_demand', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_fine_collection', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_new_member_growth', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_peak_hours', { p_days: 7 });
    expect(rpc).toHaveBeenCalledWith('report_genre_breakdown', { p_days: 7 });
  });

  it('returns the typed rows of each metric', async () => {
    const rpc = vi.fn((fn: string) => Promise.resolve({ data: ROWS[fn], error: null }));
    const repo = setup(rpc);

    expect((await repo.loadOverdueAging()).rows[0]?.loan_count).toBe(2);
    expect((await repo.loadDeadStock(14)).rows[0]?.title).toBe('Dune');
    expect((await repo.loadHighDemand(14)).rows[0]?.title).toBe('Beta');
    expect((await repo.loadFineCollection(14)).rows[0]?.collected).toBe(5);
    expect((await repo.loadNewMemberGrowth(14)).rows[0]?.member_count).toBe(2);
    expect((await repo.loadPeakHours(14)).rows[0]?.hour_of_day).toBe(9);
    expect((await repo.loadGenreBreakdown(14)).rows[0]?.genre).toBe('Sci-fi');
  });

  it('keeps a failed metric to itself so the other metrics still return their rows', async () => {
    const rpc = vi.fn((fn: string) => {
      if (fn === 'report_high_demand') {
        return Promise.resolve({ data: null, error: { message: 'boom' } });
      }
      return Promise.resolve({ data: ROWS[fn], error: null });
    });
    const repo = setup(rpc);

    expect(await repo.loadHighDemand(30)).toEqual({ rows: [], error: 'boom' });
    expect(await repo.loadGenreBreakdown(30)).toEqual({
      rows: [{ genre: 'Sci-fi', checkout_count: 6 }],
      error: null,
    });
  });

  it('treats a null payload as no rows', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    const repo = setup(rpc);

    expect(await repo.loadDeadStock(14)).toEqual({ rows: [], error: null });
  });
});
