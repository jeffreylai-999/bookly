import { Service, inject } from '@angular/core';

import {
  createPostgrestAccess,
  type PostgrestAccessResult,
} from '../core/postgrest';
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

function metricResult<TRow>(result: PostgrestAccessResult<TRow[] | null>): MetricResult<TRow> {
  if (!result.ok) {
    return { rows: [], error: result.error.message };
  }
  return { rows: result.data ?? [], error: null };
}

@Service()
export class ReportsRepository {
  private readonly access = createPostgrestAccess(inject(SUPABASE_CLIENT));

  /** Present-state snapshot of overdue loans; not range-scoped (spec §7). */
  async loadOverdueAging(): Promise<MetricResult<OverdueAgingRow>> {
    return metricResult(await this.access.rpc('report_overdue_aging'));
  }

  async loadDeadStock(range: RangeDays): Promise<MetricResult<DeadStockRow>> {
    return metricResult(await this.access.rpc('report_dead_stock', { p_days: range }));
  }

  async loadHighDemand(range: RangeDays): Promise<MetricResult<HighDemandRow>> {
    return metricResult(await this.access.rpc('report_high_demand', { p_days: range }));
  }

  async loadFineCollection(range: RangeDays): Promise<MetricResult<FineCollectionRow>> {
    return metricResult(await this.access.rpc('report_fine_collection', { p_days: range }));
  }

  async loadNewMemberGrowth(range: RangeDays): Promise<MetricResult<NewMemberGrowthRow>> {
    return metricResult(await this.access.rpc('report_new_member_growth', { p_days: range }));
  }

  async loadPeakHours(range: RangeDays): Promise<MetricResult<PeakHoursRow>> {
    return metricResult(await this.access.rpc('report_peak_hours', { p_days: range }));
  }

  async loadGenreBreakdown(range: RangeDays): Promise<MetricResult<GenreBreakdownRow>> {
    return metricResult(await this.access.rpc('report_genre_breakdown', { p_days: range }));
  }
}
