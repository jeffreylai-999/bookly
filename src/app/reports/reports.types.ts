/** The Reports range selector only ever offers these three values (spec §7). */
export const RANGE_DAYS_OPTIONS = [7, 14, 30] as const;
export type RangeDays = (typeof RANGE_DAYS_OPTIONS)[number];

export function isRangeDays(value: number): value is RangeDays {
  return (RANGE_DAYS_OPTIONS as readonly number[]).includes(value);
}

/** Present-state overdue loans bucketed by days_late — not range-scoped. */
export type OverdueAgingRow = {
  bucket: string;
  bucket_order: number;
  loan_count: number;
};

/** Titles with a lendable copy and zero checkouts in range. */
export type DeadStockRow = {
  title_id: string;
  title: string;
  author: string;
  genre: string;
  lendable_copies: number;
};

/** Top titles by checkouts in range; ties broken by current waiting holds. */
export type HighDemandRow = {
  title_id: string;
  title: string;
  author: string;
  checkout_count: number;
  waiting_holds: number;
};

/** Per-day collected (non-voided payments) vs incurred (fines created). */
export type FineCollectionRow = {
  report_date: string;
  collected: number;
  incurred: number;
};

/** Per-day count of members.joined_at. */
export type NewMemberGrowthRow = {
  report_date: string;
  member_count: number;
};

/** Check-out-hour histogram (library tz), 0-23. */
export type PeakHoursRow = {
  hour_of_day: number;
  checkout_count: number;
};

/** Checkouts in range grouped by titles.genre. */
export type GenreBreakdownRow = {
  genre: string;
  checkout_count: number;
};
