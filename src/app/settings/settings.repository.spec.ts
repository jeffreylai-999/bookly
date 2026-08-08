import { TestBed } from '@angular/core/testing';

import {
  createPostgrestClientMock,
  createQueryBuilderMock,
} from '../core/postgrest/postgrest-access.testing';
import { SUPABASE_CLIENT } from '../core/supabase';
import { SettingsRepository } from './settings.repository';

describe('SettingsRepository', () => {
  it('lists member types ordered by name', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.listMemberTypes();

    expect(result.error).toBeNull();
    expect(client.from).toHaveBeenCalledWith('member_types');
    expect(builder.order).toHaveBeenCalledWith('name', { ascending: true });
  });

  it('reads the app_settings singleton by its constant pk', async () => {
    const builder = createQueryBuilderMock({ data: { id: true, currency: 'USD' }, error: null });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.getAppSettings();

    expect(result.row?.currency).toBe('USD');
    expect(client.from).toHaveBeenCalledWith('app_settings');
    expect(builder.eq).toHaveBeenCalledWith('id', true);
  });

  it('creates a member type without sending id/created_at', async () => {
    const builder = createQueryBuilderMock({ data: { id: 't1', name: 'Adult' }, error: null });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.createMemberType({
      name: 'Adult',
      loan_period_days: 21,
      renewal_limit: 2,
      borrow_cap: 10,
      fine_rate_per_day: 0.25,
      hold_expiry_days: 7,
    });

    expect(result.error).toBeNull();
    const inserted = builder.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted).not.toHaveProperty('id');
    expect(inserted).not.toHaveProperty('created_at');
  });

  it('updates app_settings through the singleton pk and returns the row', async () => {
    const builder = createQueryBuilderMock({
      data: { id: true, currency: 'EUR' },
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.updateAppSettings({ currency: 'EUR' });

    expect(result.row?.currency).toBe('EUR');
    const patch = builder.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('id');
    expect(patch).not.toHaveProperty('updated_at');
    expect(builder.eq).toHaveBeenCalledWith('id', true);
  });

  it('maps a foreign-key delete failure to member_type_in_use', async () => {
    const builder = createQueryBuilderMock({
      data: null,
      error: { message: 'violates foreign key', code: '23503' },
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.deleteMemberType('t1');

    expect(result.error).toBe('member_type_in_use');
  });

  it('maps a unique-violation create to name_taken', async () => {
    const builder = createQueryBuilderMock({
      data: null,
      error: { message: 'duplicate key', code: '23505' },
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.createMemberType({
      name: 'Adult',
      loan_period_days: 21,
      renewal_limit: 2,
      borrow_cap: 10,
      fine_rate_per_day: 0.25,
      hold_expiry_days: 7,
    });

    expect(result.error).toBe('name_taken');
    expect(result.row).toBeNull();
  });

  it('maps unknown write failures to save_failed', async () => {
    const builder = createQueryBuilderMock({
      data: null,
      error: { message: 'permission denied', code: '42501' },
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.updateAppSettings({ currency: 'EUR' });

    expect(result.error).toBe('save_failed');
  });
});
