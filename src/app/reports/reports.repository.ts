import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../core/supabase';
import { isRangeDays, type RangeDays, type ReportsData } from './reports.types';

const DEFAULT_RANGE_DAYS: RangeDays = 14;

export type ReportsSettings = {
  defaultRangeDays: RangeDays;
};

@Service()
export class ReportsRepository {
  private readonly supabase = inject(SUPABASE_CLIENT);

  /** Range default only — currency lives on `AppSettingsService`. */
  async getSettings(): Promise<{ settings: ReportsSettings; error: string | null }> {
    const { data, error } = await this.supabase
      .from('app_settings')
      .select('default_report_range_days')
      .eq('id', true)
      .single();

    const defaultRangeDays = data?.default_report_range_days;
    return {
      settings: {
        defaultRangeDays:
          defaultRangeDays !== undefined && isRangeDays(defaultRangeDays)
            ? defaultRangeDays
            : DEFAULT_RANGE_DAYS,
      },
      error: error?.message ?? null,
    };
  }

  /**
   * Loads all seven metrics for one range in parallel. Overdue aging ignores
   * `range` (present-state snapshot per spec §7) but is refreshed alongside
   * the rest so a single call always reflects current desk state.
   */
  async loadAll(range: RangeDays): Promise<{ data: ReportsData | null; error: string | null }> {
    const [
      overdueAging,
      deadStock,
      highDemand,
      fineCollection,
      newMemberGrowth,
      peakHours,
      genreBreakdown,
    ] = await Promise.all([
      this.supabase.rpc('report_overdue_aging'),
      this.supabase.rpc('report_dead_stock', { p_days: range }),
      this.supabase.rpc('report_high_demand', { p_days: range }),
      this.supabase.rpc('report_fine_collection', { p_days: range }),
      this.supabase.rpc('report_new_member_growth', { p_days: range }),
      this.supabase.rpc('report_peak_hours', { p_days: range }),
      this.supabase.rpc('report_genre_breakdown', { p_days: range }),
    ]);

    const results = [
      overdueAging,
      deadStock,
      highDemand,
      fineCollection,
      newMemberGrowth,
      peakHours,
      genreBreakdown,
    ];
    const firstError = results.find((r) => r.error)?.error;
    if (firstError) {
      return { data: null, error: firstError.message };
    }

    return {
      data: {
        overdueAging: overdueAging.data ?? [],
        deadStock: deadStock.data ?? [],
        highDemand: highDemand.data ?? [],
        fineCollection: fineCollection.data ?? [],
        newMemberGrowth: newMemberGrowth.data ?? [],
        peakHours: peakHours.data ?? [],
        genreBreakdown: genreBreakdown.data ?? [],
      },
      error: null,
    };
  }
}
