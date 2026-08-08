import { TestBed } from '@angular/core/testing';

import {
  createPostgrestClientMock,
  createQueryBuilderMock,
} from '../core/postgrest/postgrest-access.testing';
import { SUPABASE_CLIENT } from '../core/supabase';
import {
  AuditRepository,
  localDayEndExclusiveIso,
  localDayStartIso,
} from './audit.repository';

describe('AuditRepository', () => {
  it('lists audit rows with composed filters and server-side pagination', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null, count: 0 });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [AuditRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(AuditRepository);
    await repo.list({
      page: 2,
      pageSize: 10,
      actorId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002',
      action: 'member.status',
      entityType: 'member',
      fromDate: '2026-07-01',
      toDate: '2026-07-31',
    });

    expect(client.from).toHaveBeenCalledWith('audit_log');
    expect(builder.select).toHaveBeenCalledWith(
      '*, actor_profile:profiles!audit_log_actor_fkey(id, full_name, email)',
      { count: 'exact' },
    );
    expect(builder.eq).toHaveBeenCalledWith('actor', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002');
    expect(builder.eq).toHaveBeenCalledWith('action', 'member.status');
    expect(builder.eq).toHaveBeenCalledWith('entity_type', 'member');
    expect(builder.gte).toHaveBeenCalledWith('created_at', localDayStartIso('2026-07-01'));
    expect(builder.lt).toHaveBeenCalledWith('created_at', localDayEndExclusiveIso('2026-07-31'));
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(builder.range).toHaveBeenCalledWith(10, 19);
  });

  it('skips optional filters when set to all / empty', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null, count: 0 });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [AuditRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(AuditRepository);
    await repo.list({
      page: 1,
      pageSize: 10,
      actorId: 'all',
      action: 'all',
      entityType: 'all',
      fromDate: '',
      toDate: '',
    });

    expect(builder.eq).not.toHaveBeenCalled();
    expect(builder.gte).not.toHaveBeenCalled();
    expect(builder.lt).not.toHaveBeenCalled();
    expect(builder.range).toHaveBeenCalledWith(0, 9);
  });

  it('lists the most recent entries regardless of filters, for the Overview feed', async () => {
    const builder = createQueryBuilderMock({
      data: [{ id: 'a1', action: 'loan.checkin', entity_type: 'loan', entity_id: 'l1' }],
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [AuditRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(AuditRepository);
    const result = await repo.listRecent(8);

    expect(client.from).toHaveBeenCalledWith('audit_log');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(builder.limit).toHaveBeenCalledWith(8);
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(1);
  });

  it('lists actor profiles for the filter dropdown', async () => {
    const builder = createQueryBuilderMock({
      data: [{ id: 'a1', full_name: 'Admin', email: 'admin@bookly.local' }],
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [AuditRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(AuditRepository);
    const result = await repo.listActors();

    expect(client.from).toHaveBeenCalledWith('profiles');
    expect(builder.select).toHaveBeenCalledWith('id, full_name, email');
    expect(builder.order).toHaveBeenCalledWith('full_name', { ascending: true });
    expect(result.rows).toHaveLength(1);
    expect(result.error).toBeNull();
  });
});
