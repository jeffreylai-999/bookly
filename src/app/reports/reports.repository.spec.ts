import { TestBed } from '@angular/core/testing';

import { createPostgrestClientMock } from '../core/postgrest/postgrest-access.testing';
import { SUPABASE_CLIENT } from '../core/supabase';
import { ReportsRepository } from './reports.repository';

function setup(
  rpc:
    | { data: unknown; error: { message: string; code?: string } | null }
    | ((fn: string, args?: unknown) => { data: unknown; error: { message: string; code?: string } | null }),
) {
  const client = createPostgrestClientMock({ rpc });
  TestBed.configureTestingModule({
    providers: [ReportsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
  });
  return { repo: TestBed.inject(ReportsRepository), client };
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
    const { repo, client } = setup({ data: [], error: null });

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
    expect(client.rpc).toHaveBeenCalledWith('report_overdue_aging', undefined);
    expect(client.rpc).toHaveBeenCalledWith('report_dead_stock', { p_days: 7 });
    expect(client.rpc).toHaveBeenCalledWith('report_high_demand', { p_days: 7 });
    expect(client.rpc).toHaveBeenCalledWith('report_fine_collection', { p_days: 7 });
    expect(client.rpc).toHaveBeenCalledWith('report_new_member_growth', { p_days: 7 });
    expect(client.rpc).toHaveBeenCalledWith('report_peak_hours', { p_days: 7 });
    expect(client.rpc).toHaveBeenCalledWith('report_genre_breakdown', { p_days: 7 });
  });

  it('returns the typed rows of each metric', async () => {
    const { repo } = setup((fn) => ({ data: ROWS[fn], error: null }));

    expect((await repo.loadOverdueAging()).rows[0]?.loan_count).toBe(2);
    expect((await repo.loadDeadStock(14)).rows[0]?.title).toBe('Dune');
    expect((await repo.loadHighDemand(14)).rows[0]?.title).toBe('Beta');
    expect((await repo.loadFineCollection(14)).rows[0]?.collected).toBe(5);
    expect((await repo.loadNewMemberGrowth(14)).rows[0]?.member_count).toBe(2);
    expect((await repo.loadPeakHours(14)).rows[0]?.hour_of_day).toBe(9);
    expect((await repo.loadGenreBreakdown(14)).rows[0]?.genre).toBe('Sci-fi');
  });

  it('keeps a failed metric to itself so the other metrics still return their rows', async () => {
    const { repo } = setup((fn) => {
      if (fn === 'report_high_demand') {
        return { data: null, error: { message: 'boom' } };
      }
      return { data: ROWS[fn], error: null };
    });

    expect(await repo.loadHighDemand(30)).toEqual({ rows: [], error: 'boom' });
    expect(await repo.loadGenreBreakdown(30)).toEqual({
      rows: [{ genre: 'Sci-fi', checkout_count: 6 }],
      error: null,
    });
  });

  it('treats a null payload as no rows', async () => {
    const { repo } = setup({ data: null, error: null });

    expect(await repo.loadDeadStock(14)).toEqual({ rows: [], error: null });
  });
});
