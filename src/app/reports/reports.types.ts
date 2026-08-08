import type { Database } from '../core/supabase';

/** The Reports range selector only ever offers these three values (spec §7). */
export const RANGE_DAYS_OPTIONS = [7, 14, 30] as const;
export type RangeDays = (typeof RANGE_DAYS_OPTIONS)[number];

export function isRangeDays(value: number): value is RangeDays {
  return (RANGE_DAYS_OPTIONS as readonly number[]).includes(value);
}

type Functions = Database['public']['Functions'];

/** Present-state overdue loans bucketed by days_late — not range-scoped. */
export type OverdueAgingRow = Functions['report_overdue_aging']['Returns'][number];

/** Titles with a lendable copy and zero checkouts in range. */
export type DeadStockRow = Functions['report_dead_stock']['Returns'][number];

/** Top titles by checkouts in range; ties broken by current waiting holds. */
export type HighDemandRow = Functions['report_high_demand']['Returns'][number];

/** Per-day collected (non-voided payments) vs incurred (fines created). */
export type FineCollectionRow = Functions['report_fine_collection']['Returns'][number];

/** Per-day count of members.joined_at. */
export type NewMemberGrowthRow = Functions['report_new_member_growth']['Returns'][number];

/** Check-out-hour histogram (library tz), 0-23. */
export type PeakHoursRow = Functions['report_peak_hours']['Returns'][number];

/** Checkouts in range grouped by titles.genre. */
export type GenreBreakdownRow = Functions['report_genre_breakdown']['Returns'][number];
