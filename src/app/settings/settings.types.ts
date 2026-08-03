import type { Tables } from '../core/supabase';

export type MemberType = Tables<'member_types'>;
export type AppSettings = Tables<'app_settings'>;

export interface MemberTypeFormValue {
  name: string;
  loanPeriodDays: number;
  renewalLimit: number;
  borrowCap: number;
  fineRatePerDay: number;
  holdExpiryDays: number;
}

/**
 * `defaultReportRangeDays` rides the form as a string: a native `<select>`
 * only speaks strings, and the schema converts on save.
 */
export interface AppSettingsFormValue {
  currency: string;
  timezone: string;
  defaultLocale: string;
  fineBlockThreshold: number;
  damagedFeeDefault: number;
  lostFeeDefault: number;
  notifyOnHoldReady: boolean;
  notifyOnOverdue: boolean;
  notifyOnPayment: boolean;
  defaultReportRangeDays: string;
}

export type SettingsMutationError =
  | 'name_taken'
  | 'member_type_in_use'
  | 'save_failed'
  | 'audit_failed'
  | 'load_failed';

/** Reports range selector options (mirrors the app_settings CHECK). */
export const REPORT_RANGE_OPTIONS = ['7', '14', '30'] as const;

/** ISO 4217 uppercase three-letter code. */
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

/**
 * audit_log.entity_id is a uuid; the app_settings singleton has a boolean pk,
 * so its audit rows log under the nil UUID by convention.
 */
export const APP_SETTINGS_AUDIT_ID = '00000000-0000-0000-0000-000000000000';

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function toMemberTypeFormValue(row: MemberType): MemberTypeFormValue {
  return {
    name: row.name,
    loanPeriodDays: row.loan_period_days,
    renewalLimit: row.renewal_limit,
    borrowCap: row.borrow_cap,
    fineRatePerDay: row.fine_rate_per_day,
    holdExpiryDays: row.hold_expiry_days,
  };
}

export function toAppSettingsFormValue(row: AppSettings): AppSettingsFormValue {
  return {
    currency: row.currency,
    timezone: row.timezone,
    defaultLocale: row.default_locale,
    fineBlockThreshold: row.fine_block_threshold,
    damagedFeeDefault: row.damaged_fee_default,
    lostFeeDefault: row.lost_fee_default,
    notifyOnHoldReady: row.notify_on_hold_ready,
    notifyOnOverdue: row.notify_on_overdue,
    notifyOnPayment: row.notify_on_payment,
    defaultReportRangeDays: String(row.default_report_range_days),
  };
}
