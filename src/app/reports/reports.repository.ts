import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../core/supabase';
import type {
  DeadStockRow,
  FineCollectionRow,
  GenreBreakdownRow,
  HighDemandRow,
  NewMemberGrowthRow,
  OverdueAgingRow,
  PeakHoursRow,
  RangeDays,
} from './reports.types';

/** One read per metric: a rejected RPC can only ever blank its own card. */
type MetricResult<TRow> = { rows: TRow[]; error: string | null };

@Service()
export class ReportsRepository {
  private readonly supabase = inject(SUPABASE_CLIENT);

  /** Present-state snapshot of overdue loans; not range-scoped (spec §7). */
  async loadOverdueAging(): Promise<MetricResult<OverdueAgingRow>> {
    const { data, error } = await this.supabase.rpc('report_overdue_aging');
    return { rows: data ?? [], error: error?.message ?? null };
  }

  async loadDeadStock(range: RangeDays): Promise<MetricResult<DeadStockRow>> {
    const { data, error } = await this.supabase.rpc('report_dead_stock', { p_days: range });
    return { rows: data ?? [], error: error?.message ?? null };
  }

  async loadHighDemand(range: RangeDays): Promise<MetricResult<HighDemandRow>> {
    const { data, error } = await this.supabase.rpc('report_high_demand', { p_days: range });
    return { rows: data ?? [], error: error?.message ?? null };
  }

  async loadFineCollection(range: RangeDays): Promise<MetricResult<FineCollectionRow>> {
    const { data, error } = await this.supabase.rpc('report_fine_collection', { p_days: range });
    return { rows: data ?? [], error: error?.message ?? null };
  }

  async loadNewMemberGrowth(range: RangeDays): Promise<MetricResult<NewMemberGrowthRow>> {
    const { data, error } = await this.supabase.rpc('report_new_member_growth', { p_days: range });
    return { rows: data ?? [], error: error?.message ?? null };
  }

  async loadPeakHours(range: RangeDays): Promise<MetricResult<PeakHoursRow>> {
    const { data, error } = await this.supabase.rpc('report_peak_hours', { p_days: range });
    return { rows: data ?? [], error: error?.message ?? null };
  }

  async loadGenreBreakdown(range: RangeDays): Promise<MetricResult<GenreBreakdownRow>> {
    const { data, error } = await this.supabase.rpc('report_genre_breakdown', { p_days: range });
    return { rows: data ?? [], error: error?.message ?? null };
  }
}
