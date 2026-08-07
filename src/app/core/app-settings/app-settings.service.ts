import { Service, inject, signal } from '@angular/core';

import { SUPABASE_CLIENT } from '../supabase';

/** ISO 4217 uppercase three-letter code. CurrencyPipe throws on anything else. */
export const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const DEFAULT_CURRENCY = 'USD';
const DEFAULT_TIMEZONE = 'America/New_York';
const DEFAULT_FINE_BLOCK_THRESHOLD = 10;

/** Falls back to USD when missing or not a valid ISO 4217 code. */
export function normalizeCurrency(code: string | null | undefined): string {
  if (!code || !CURRENCY_PATTERN.test(code)) {
    return DEFAULT_CURRENCY;
  }
  return code;
}

/**
 * Single owner for library-wide desk configuration read from `app_settings`.
 * Currency, timezone, and the fine block threshold share one fetch so every
 * reader sees the same values at the same moment.
 */
@Service()
export class AppSettingsService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  private readonly currencyState = signal(DEFAULT_CURRENCY);
  private readonly timezoneState = signal(DEFAULT_TIMEZONE);
  private readonly fineBlockThresholdState = signal(DEFAULT_FINE_BLOCK_THRESHOLD);

  readonly currency = this.currencyState.asReadonly();
  readonly timezone = this.timezoneState.asReadonly();
  readonly fineBlockThreshold = this.fineBlockThresholdState.asReadonly();

  private loadPromise: Promise<void> | null = null;

  /** Idempotent — concurrent and repeat callers share one `app_settings` read. */
  load(): Promise<void> {
    if (!this.loadPromise) {
      this.loadPromise = this.fetch();
    }
    return this.loadPromise;
  }

  private async fetch(): Promise<void> {
    const { data, error } = await this.supabase
      .from('app_settings')
      .select('currency, timezone, fine_block_threshold')
      .eq('id', true)
      .single();

    if (error || !data) {
      this.currencyState.set(DEFAULT_CURRENCY);
      this.timezoneState.set(DEFAULT_TIMEZONE);
      this.fineBlockThresholdState.set(DEFAULT_FINE_BLOCK_THRESHOLD);
      return;
    }

    this.currencyState.set(normalizeCurrency(data.currency));
    this.timezoneState.set(data.timezone || DEFAULT_TIMEZONE);
    this.fineBlockThresholdState.set(
      data.fine_block_threshold ?? DEFAULT_FINE_BLOCK_THRESHOLD,
    );
  }
}
