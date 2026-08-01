import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../core/supabase';
import { SettingsRepository, mapWriteError } from './settings.repository';

function createQueryBuilder(result: {
  data: unknown;
  error: { message: string; code?: string } | null;
}) {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    single: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  builder.select.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.delete.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.single.mockReturnValue(builder);
  return builder;
}

describe('SettingsRepository', () => {
  it('lists member types ordered by name', async () => {
    const builder = createQueryBuilder({ data: [], error: null });
    const from = vi.fn().mockReturnValue(builder);

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: { from } }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.listMemberTypes();

    expect(result.error).toBeNull();
    expect(from).toHaveBeenCalledWith('member_types');
    expect(builder.order).toHaveBeenCalledWith('name', { ascending: true });
  });

  it('reads the app_settings singleton by its constant pk', async () => {
    const builder = createQueryBuilder({ data: { id: true, currency: 'USD' }, error: null });
    const from = vi.fn().mockReturnValue(builder);

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: { from } }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.getAppSettings();

    expect(result.row?.currency).toBe('USD');
    expect(from).toHaveBeenCalledWith('app_settings');
    expect(builder.eq).toHaveBeenCalledWith('id', true);
  });

  it('creates a member type without sending id/created_at', async () => {
    const builder = createQueryBuilder({ data: { id: 't1', name: 'Adult' }, error: null });
    const from = vi.fn().mockReturnValue(builder);

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: { from } }],
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
    const builder = createQueryBuilder({
      data: { id: true, currency: 'EUR' },
      error: null,
    });
    const from = vi.fn().mockReturnValue(builder);

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: { from } }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.updateAppSettings({ currency: 'EUR' });

    expect(result.row?.currency).toBe('EUR');
    const patch = builder.update.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(patch).not.toHaveProperty('id');
    expect(patch).not.toHaveProperty('updated_at');
    expect(builder.eq).toHaveBeenCalledWith('id', true);
  });

  it('exposes the Postgres error code on delete so the store can type it', async () => {
    const builder = createQueryBuilder({
      data: null,
      error: { message: 'violates foreign key', code: '23503' },
    });
    const from = vi.fn().mockReturnValue(builder);

    await TestBed.configureTestingModule({
      providers: [SettingsRepository, { provide: SUPABASE_CLIENT, useValue: { from } }],
    }).compileComponents();

    const repo = TestBed.inject(SettingsRepository);
    const result = await repo.deleteMemberType('t1');

    expect(result.code).toBe('23503');
  });

  it('maps write errors to typed settings errors', () => {
    expect(mapWriteError({ error: 'dup', code: '23505' })).toBe('name_taken');
    expect(mapWriteError({ error: 'fk', code: '23503' })).toBe('member_type_in_use');
    expect(mapWriteError({ error: 'other', code: '42501' })).toBe('save_failed');
    expect(mapWriteError({ error: 'other', code: null })).toBe('save_failed');
  });
});
