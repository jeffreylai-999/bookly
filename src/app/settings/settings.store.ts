import { Service, inject, signal } from '@angular/core';

import { AppSettingsService } from '../core/app-settings';
import { AuditService } from '../core/audit';
import type { MemberTypesClientInsert, MemberTypesClientUpdate } from '../core/supabase';
import { SettingsRepository, mapWriteError } from './settings.repository';
import {
  APP_SETTINGS_AUDIT_ID,
  type AppSettings,
  type AppSettingsFormValue,
  type MemberType,
  type MemberTypeFormValue,
  type SettingsMutationError,
} from './settings.types';

@Service()
export class SettingsStore {
  private readonly repo = inject(SettingsRepository);
  private readonly audit = inject(AuditService);
  private readonly appSettingsCache = inject(AppSettingsService);

  private readonly memberTypesState = signal<MemberType[]>([]);
  private readonly appSettingsState = signal<AppSettings | null>(null);
  private readonly loadingState = signal(false);
  private readonly savingState = signal(false);
  private readonly errorState = signal<string | null>(null);

  readonly memberTypes = this.memberTypesState.asReadonly();
  readonly appSettings = this.appSettingsState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly saving = this.savingState.asReadonly();
  /** Load failures only — mutation outcomes are returned to the caller. */
  readonly error = this.errorState.asReadonly();

  async init(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const [types, settings] = await Promise.all([
        this.repo.listMemberTypes(),
        this.repo.getAppSettings(),
      ]);
      if (types.error || settings.error) {
        this.errorState.set(types.error ?? settings.error);
        this.memberTypesState.set([]);
        this.appSettingsState.set(null);
        return;
      }
      this.memberTypesState.set(types.rows);
      this.appSettingsState.set(settings.row);
    } finally {
      this.loadingState.set(false);
    }
  }

  async saveMemberType(
    id: string | null,
    form: MemberTypeFormValue,
  ): Promise<{ error: SettingsMutationError | null }> {
    this.savingState.set(true);
    try {
      const fields = {
        name: form.name.trim(),
        loan_period_days: form.loanPeriodDays,
        renewal_limit: form.renewalLimit,
        borrow_cap: form.borrowCap,
        fine_rate_per_day: form.fineRatePerDay,
        hold_expiry_days: form.holdExpiryDays,
      };
      const saved = id
        ? await this.repo.updateMemberType(id, fields satisfies MemberTypesClientUpdate)
        : await this.repo.createMemberType(fields satisfies MemberTypesClientInsert);
      if (saved.error || !saved.row) {
        return { error: mapWriteError(saved) };
      }
      const auditResult = await this.audit.log({
        action: id ? 'member_type.update' : 'member_type.create',
        entityType: 'member_type',
        entityId: saved.row.id,
        detail: { name: saved.row.name },
      });
      await this.reloadMemberTypes();
      if (this.errorState()) {
        return { error: 'load_failed' };
      }
      return { error: auditResult.error ? 'audit_failed' : null };
    } finally {
      this.savingState.set(false);
    }
  }

  async removeMemberType(id: string): Promise<{ error: SettingsMutationError | null }> {
    this.savingState.set(true);
    try {
      const row = this.memberTypesState().find((type) => type.id === id);
      const deleted = await this.repo.deleteMemberType(id);
      if (deleted.error) {
        return { error: mapWriteError(deleted) };
      }
      const auditResult = await this.audit.log({
        action: 'member_type.delete',
        entityType: 'member_type',
        entityId: id,
        detail: { name: row?.name ?? null },
      });
      await this.reloadMemberTypes();
      if (this.errorState()) {
        return { error: 'load_failed' };
      }
      return { error: auditResult.error ? 'audit_failed' : null };
    } finally {
      this.savingState.set(false);
    }
  }

  async saveAppSettings(
    form: AppSettingsFormValue,
  ): Promise<{ error: SettingsMutationError | null }> {
    this.savingState.set(true);
    try {
      const saved = await this.repo.updateAppSettings({
        currency: form.currency.trim().toUpperCase(),
        timezone: form.timezone.trim(),
        default_locale: form.defaultLocale,
        fine_block_threshold: form.fineBlockThreshold,
        damaged_fee_default: form.damagedFeeDefault,
        lost_fee_default: form.lostFeeDefault,
        notify_on_hold_ready: form.notifyOnHoldReady,
        notify_on_overdue: form.notifyOnOverdue,
        notify_on_payment: form.notifyOnPayment,
        default_report_range_days: Number(form.defaultReportRangeDays),
      });
      if (saved.error || !saved.row) {
        return { error: mapWriteError(saved) };
      }
      const auditResult = await this.audit.log({
        action: 'settings.update',
        entityType: 'app_settings',
        entityId: APP_SETTINGS_AUDIT_ID,
        detail: { currency: saved.row.currency, timezone: saved.row.timezone },
      });
      this.appSettingsState.set(saved.row);
      // Keep the shared cache in step so Fines/Reports do not show the old row.
      this.appSettingsCache.set(saved.row);
      return { error: auditResult.error ? 'audit_failed' : null };
    } finally {
      this.savingState.set(false);
    }
  }

  private async reloadMemberTypes(): Promise<void> {
    const result = await this.repo.listMemberTypes();
    if (result.error) {
      this.errorState.set(result.error);
      this.memberTypesState.set([]);
      return;
    }
    // A successful reload clears any earlier load failure — otherwise a stale
    // error would misreport the next save as load_failed and keep the alert up.
    this.errorState.set(null);
    this.memberTypesState.set(result.rows);
  }
}
