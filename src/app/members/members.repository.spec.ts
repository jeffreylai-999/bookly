import { TestBed } from '@angular/core/testing';

import {
  createPostgrestClientMock,
  createQueryBuilderMock,
} from '../core/postgrest/postgrest-access.testing';
import { SUPABASE_CLIENT } from '../core/supabase';
import { MembersRepository } from './members.repository';

describe('MembersRepository', () => {
  it('lists members with server-side pagination, name search, and status filter', async () => {
    const builder = createQueryBuilderMock({
      data: [],
      error: null,
      count: 0,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [MembersRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(MembersRepository);
    await repo.list({
      page: 2,
      pageSize: 10,
      nameSearch: 'Ada',
      status: 'active',
    });

    expect(client.from).toHaveBeenCalledWith('members');
    expect(builder.select).toHaveBeenCalledWith('*, member_type:member_types(id, name)', {
      count: 'exact',
    });
    expect(builder.ilike).toHaveBeenCalledWith('name', '%Ada%');
    expect(builder.eq).toHaveBeenCalledWith('status', 'active');
    expect(builder.range).toHaveBeenCalledWith(10, 19);
  });

  it('creates a member without sending status (defaults to active server-side)', async () => {
    const builder = createQueryBuilderMock({
      data: {
        id: 'm1',
        name: 'Ada',
        status: 'active',
        member_type: { id: 't1', name: 'Adult' },
      },
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [MembersRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(MembersRepository);
    const result = await repo.create({
      name: 'Ada',
      member_type_id: 't1',
      card_barcode: 'MBR-ADA-1',
      email: null,
      phone: null,
    });

    expect(result.error).toBeNull();
    expect(builder.insert).toHaveBeenCalledWith({
      name: 'Ada',
      member_type_id: 't1',
      card_barcode: 'MBR-ADA-1',
      email: null,
      phone: null,
    });
    const inserted = builder.insert.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(inserted).not.toHaveProperty('status');
  });

  it('fetches a single member by id with member type joined', async () => {
    const builder = createQueryBuilderMock({
      data: {
        id: 'm1',
        name: 'Ada',
        status: 'active',
        member_type: { id: 't1', name: 'Adult' },
      },
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [MembersRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(MembersRepository);
    const result = await repo.getById('m1');

    expect(client.from).toHaveBeenCalledWith('members');
    expect(builder.select).toHaveBeenCalledWith('*, member_type:member_types(id, name)');
    expect(builder.eq).toHaveBeenCalledWith('id', 'm1');
    expect(result.error).toBeNull();
    expect(result.row?.id).toBe('m1');
  });

  it('returns a null row when no member matches the id', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [MembersRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(MembersRepository);
    const result = await repo.getById('missing');

    expect(result).toEqual({ row: null, error: null });
  });

  it('lists member types through the shared ordered read', async () => {
    const builder = createQueryBuilderMock({
      data: [{ id: 't1', name: 'Adult' }],
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [MembersRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(MembersRepository);
    const result = await repo.listMemberTypes();

    expect(client.from).toHaveBeenCalledWith('member_types');
    expect(builder.order).toHaveBeenCalledWith('name', { ascending: true });
    expect(result.error).toBeNull();
    expect(result.rows).toHaveLength(1);
  });

  it('changes status only through set_member_status RPC', async () => {
    const client = createPostgrestClientMock({
      rpc: {
        data: { id: 'm1', status: 'suspended' },
        error: null,
      },
    });

    await TestBed.configureTestingModule({
      providers: [MembersRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(MembersRepository);
    await repo.setStatus('m1', 'suspended');

    expect(client.rpc).toHaveBeenCalledWith('set_member_status', {
      p_member_id: 'm1',
      p_status: 'suspended',
    });
  });
});
