import { Service, inject, signal } from '@angular/core';

import { SUPABASE_CLIENT } from '../supabase';

/** ISO 4217 uppercase three-letter code. CurrencyPipe throws on anything else. */
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const DEFAULT_CURRENCY = 'USD';

/** Falls back to USD when missing or not a valid ISO 4217 code. */
export function normalizeCurrency(code: string | null | undefined): string {
  if (!code || !CURRENCY_PATTERN.test(code)) {
    return DEFAULT_CURRENCY;
  }
  return code;
}

/** The `app_settings` columns this service caches, as stored. */
type AppSettingsRead = {
  currency: string | null;
  default_report_range_days: number | null;
};

/**
 * Cached read of the `app_settings` singleton for the columns features display.
 * Reports and Fines share one fetch instead of querying the row each.
 *
 * Not yet the only reader: overview, circulation, and notifications still query
 * `app_settings` for currency directly.
 */
@Service()
export class AppSettingsService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  private readonly currencyState = signal(DEFAULT_CURRENCY);
  /** Raw column value — Reports applies its own `isRangeDays` guard. */
  private readonly reportRangeDaysState = signal<number | null>(null);

  readonly currency = this.currencyState.asReadonly();
  readonly reportRangeDays = this.reportRangeDaysState.asReadonly();

  private loadPromise: Promise<void> | null = null;

  /** Idempotent — concurrent and repeat callers share one `app_settings` read. */
  load(): Promise<void> {
    return (this.loadPromise ??= this.fetch());
  }

  /** Called after a settings write so readers do not keep serving the old row. */
  set(row: AppSettingsRead): void {
    this.loadPromise = Promise.resolve();
    this.currencyState.set(normalizeCurrency(row.currency));
    this.reportRangeDaysState.set(row.default_report_range_days);
  }

  private async fetch(): Promise<void> {
    const { data, error } = await this.supabase
      .from('app_settings')
      .select('currency, default_report_range_days')
      .eq('id', true)
      .single();

    if (error || !data) {
      // Drop the memo so a transient failure does not pin defaults for the session.
      this.loadPromise = null;
      return;
    }

    this.set(data);
  }
}
