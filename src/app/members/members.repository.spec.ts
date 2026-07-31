import { TestBed } from '@angular/core/testing';

import { SUPABASE_CLIENT } from '../core/supabase';
import { MembersRepository } from './members.repository';

function createQueryBuilder(result: {
  data: unknown;
  error: { message: string } | null;
  count?: number | null;
}) {
  const builder = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    eq: vi.fn(),
    ilike: vi.fn(),
    order: vi.fn(),
    range: vi.fn(),
    single: vi.fn(),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  builder.select.mockReturnValue(builder);
  builder.insert.mockReturnValue(builder);
  builder.update.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.ilike.mockReturnValue(builder);
  builder.order.mockReturnValue(builder);
  builder.range.mockReturnValue(builder);
  builder.single.mockReturnValue(builder);
  return builder;
}

describe('MembersRepository', () => {
  it('lists members with server-side pagination, name search, and status filter', async () => {
    const builder = createQueryBuilder({
      data: [],
      error: null,
      count: 0,
    });
    const from = vi.fn().mockReturnValue(builder);

    await TestBed.configureTestingModule({
      providers: [
        MembersRepository,
        { provide: SUPABASE_CLIENT, useValue: { from, rpc: vi.fn() } },
      ],
    }).compileComponents();

    const repo = TestBed.inject(MembersRepository);
    await repo.list({
      page: 2,
      pageSize: 10,
      nameSearch: 'Ada',
      status: 'active',
    });

    expect(from).toHaveBeenCalledWith('members');
    expect(builder.select).toHaveBeenCalledWith('*, member_type:member_types(id, name)', {
      count: 'exact',
    });
    expect(builder.ilike).toHaveBeenCalledWith('name', '%Ada%');
    expect(builder.eq).toHaveBeenCalledWith('status', 'active');
    expect(builder.range).toHaveBeenCalledWith(10, 19);
  });

  it('creates a member without sending status (defaults to active server-side)', async () => {
    const builder = createQueryBuilder({
      data: {
        id: 'm1',
        name: 'Ada',
        status: 'active',
        member_type: { id: 't1', name: 'Adult' },
      },
      error: null,
    });
    const from = vi.fn().mockReturnValue(builder);

    await TestBed.configureTestingModule({
      providers: [
        MembersRepository,
        { provide: SUPABASE_CLIENT, useValue: { from, rpc: vi.fn() } },
      ],
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

  it('changes status only through set_member_status RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: 'm1', status: 'suspended' },
      error: null,
    });

    await TestBed.configureTestingModule({
      providers: [
        MembersRepository,
        { provide: SUPABASE_CLIENT, useValue: { from: vi.fn(), rpc } },
      ],
    }).compileComponents();

    const repo = TestBed.inject(MembersRepository);
    await repo.setStatus('m1', 'suspended');

    expect(rpc).toHaveBeenCalledWith('set_member_status', {
      p_member_id: 'm1',
      p_status: 'suspended',
    });
  });
});
