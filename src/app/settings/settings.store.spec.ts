import { TestBed } from '@angular/core/testing';

import { AppSettingsService } from '../core/app-settings';
import { AuditService } from '../core/audit';
import { SettingsRepository } from './settings.repository';
import { SettingsStore } from './settings.store';
import {
  APP_SETTINGS_AUDIT_ID,
  type AppSettings,
  type AppSettingsFormValue,
  type MemberType,
  type MemberTypeFormValue,
} from './settings.types';

const sampleType: MemberType = {
  id: 't1',
  name: 'Adult',
  loan_period_days: 21,
  renewal_limit: 2,
  borrow_cap: 10,
  fine_rate_per_day: 0.25,
  hold_expiry_days: 7,
  created_at: '2026-01-01T00:00:00Z',
};

const sampleSettings: AppSettings = {
  id: true,
  currency: 'USD',
  timezone: 'America/New_York',
  default_locale: 'en',
  fine_block_threshold: 10,
  damaged_fee_default: 10,
  lost_fee_default: 25,
  notify_on_hold_ready: true,
  notify_on_overdue: true,
  notify_on_payment: true,
  default_report_range_days: 14,
  expire_holds_last_run_date: null,
  notify_overdue_last_run_date: null,
  updated_at: '2026-01-01T00:00:00Z',
};

const typeForm: MemberTypeFormValue = {
  name: 'Adult',
  loanPeriodDays: 21,
  renewalLimit: 2,
  borrowCap: 10,
  fineRatePerDay: 0.25,
  holdExpiryDays: 7,
};

const appForm: AppSettingsFormValue = {
  currency: 'eur',
  timezone: 'Europe/London',
  defaultLocale: 'en',
  fineBlockThreshold: 12.5,
  damagedFeeDefault: 10,
  lostFeeDefault: 25,
  notifyOnHoldReady: false,
  notifyOnOverdue: true,
  notifyOnPayment: true,
  defaultReportRangeDays: '30',
};

function repoFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    listMemberTypes: vi.fn().mockResolvedValue({ rows: [sampleType], error: null }),
    getAppSettings: vi.fn().mockResolvedValue({ row: sampleSettings, error: null }),
    createMemberType: vi.fn().mockResolvedValue({ row: sampleType, error: null }),
    updateMemberType: vi.fn().mockResolvedValue({ row: sampleType, error: null }),
    deleteMemberType: vi.fn().mockResolvedValue({ error: null }),
    updateAppSettings: vi.fn().mockResolvedValue({ row: sampleSettings, error: null }),
    ...overrides,
  };
}

async function createStore(repo: ReturnType<typeof repoFake>, log = vi.fn().mockResolvedValue({ error: null })) {
  await TestBed.configureTestingModule({
    providers: [
      SettingsStore,
      { provide: SettingsRepository, useValue: repo },
      { provide: AuditService, useValue: { log } },
      { provide: AppSettingsService, useValue: { set: vi.fn() } },
    ],
  }).compileComponents();
  return {
    store: TestBed.inject(SettingsStore),
    log: log as ReturnType<typeof vi.fn>,
    appSettings: TestBed.inject(AppSettingsService),
  };
}

describe('SettingsStore', () => {
  it('init loads member types and app settings together', async () => {
    const repo = repoFake();
    const { store, appSettings } = await createStore(repo);

    await store.init();

    expect(store.loading()).toBe(false);
    expect(store.error()).toBeNull();
    expect(store.memberTypes()).toEqual([sampleType]);
    expect(store.appSettings()).toEqual(sampleSettings);
    expect(appSettings.set).toHaveBeenCalledWith(sampleSettings);
  });

  it('init surfaces a load error and clears state', async () => {
    const repo = repoFake({
      getAppSettings: vi.fn().mockResolvedValue({ row: null, error: 'down' }),
    });
    const { store } = await createStore(repo);

    await store.init();

    expect(store.error()).toBe('down');
    expect(store.memberTypes()).toEqual([]);
    expect(store.appSettings()).toBeNull();
  });

  it('creates a member type, audits member_type.create, and reloads', async () => {
    const repo = repoFake();
    const { store, log } = await createStore(repo);

    const result = await store.saveMemberType(null, typeForm);

    expect(result.error).toBeNull();
    expect(repo.createMemberType).toHaveBeenCalledWith({
      name: 'Adult',
      loan_period_days: 21,
      renewal_limit: 2,
      borrow_cap: 10,
      fine_rate_per_day: 0.25,
      hold_expiry_days: 7,
    });
    expect(log).toHaveBeenCalledWith({
      action: 'member_type.create',
      entityType: 'member_type',
      entityId: 't1',
      detail: { name: 'Adult' },
    });
    expect(repo.listMemberTypes).toHaveBeenCalled();
  });

  it('updates a member type with a member_type.update audit row', async () => {
    const repo = repoFake();
    const { store, log } = await createStore(repo);

    const result = await store.saveMemberType('t1', { ...typeForm, loanPeriodDays: 3 });

    expect(result.error).toBeNull();
    expect(repo.updateMemberType).toHaveBeenCalledWith('t1', {
      name: 'Adult',
      loan_period_days: 3,
      renewal_limit: 2,
      borrow_cap: 10,
      fine_rate_per_day: 0.25,
      hold_expiry_days: 7,
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'member_type.update', entityId: 't1' }),
    );
  });

  it('surfaces a typed name_taken rejection from the repository', async () => {
    const repo = repoFake({
      createMemberType: vi.fn().mockResolvedValue({ row: null, error: 'name_taken' }),
    });
    const { store } = await createStore(repo);

    const result = await store.saveMemberType(null, typeForm);

    expect(result.error).toBe('name_taken');
  });

  it('surfaces a typed member_type_in_use rejection from the repository', async () => {
    const repo = repoFake({
      deleteMemberType: vi.fn().mockResolvedValue({ error: 'member_type_in_use' }),
    });
    const { store } = await createStore(repo);
    await store.init();

    const result = await store.removeMemberType('t1');

    expect(result.error).toBe('member_type_in_use');
  });

  it('deletes a member type with a member_type.delete audit row', async () => {
    const repo = repoFake();
    const { store, log } = await createStore(repo);
    await store.init();

    const result = await store.removeMemberType('t1');

    expect(result.error).toBeNull();
    expect(repo.deleteMemberType).toHaveBeenCalledWith('t1');
    expect(log).toHaveBeenCalledWith({
      action: 'member_type.delete',
      entityType: 'member_type',
      entityId: 't1',
      detail: { name: 'Adult' },
    });
  });

  it('saves app settings, audits settings.update against the nil-uuid singleton', async () => {
    const repo = repoFake();
    const { store, log, appSettings } = await createStore(repo);

    const result = await store.saveAppSettings(appForm);

    expect(result.error).toBeNull();
    expect(appSettings.set).toHaveBeenCalledWith(sampleSettings);
    expect(repo.updateAppSettings).toHaveBeenCalledWith({
      currency: 'EUR',
      timezone: 'Europe/London',
      default_locale: 'en',
      fine_block_threshold: 12.5,
      damaged_fee_default: 10,
      lost_fee_default: 25,
      notify_on_hold_ready: false,
      notify_on_overdue: true,
      notify_on_payment: true,
      default_report_range_days: 30,
    });
    expect(log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'settings.update',
        entityType: 'app_settings',
        entityId: APP_SETTINGS_AUDIT_ID,
      }),
    );
    expect(store.appSettings()).toEqual(sampleSettings);
  });

  it('reports audit_failed when the save landed but the audit write did not', async () => {
    const repo = repoFake();
    const { store } = await createStore(repo, vi.fn().mockResolvedValue({ error: 'no audit' }));

    const result = await store.saveAppSettings(appForm);

    expect(result.error).toBe('audit_failed');
  });

  it('clears a stale load error once a post-save reload succeeds', async () => {
    const listMemberTypes = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], error: 'down' })
      .mockResolvedValue({ rows: [sampleType], error: null });
    const repo = repoFake({ listMemberTypes });
    const { store } = await createStore(repo);

    await store.init();
    expect(store.error()).toBe('down');

    const result = await store.saveMemberType('t1', typeForm);

    expect(result.error).toBeNull();
    expect(store.error()).toBeNull();
    expect(store.memberTypes()).toEqual([sampleType]);
  });
});
