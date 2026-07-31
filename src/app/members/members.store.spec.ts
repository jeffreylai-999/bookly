import { TestBed } from '@angular/core/testing';

import { AuditService } from '../core/audit';
import { MembersRepository } from './members.repository';
import { MembersStore } from './members.store';
import type { MemberListItem } from './members.types';

const sampleMember: MemberListItem = {
  id: 'm1',
  name: 'Ada Lovelace',
  member_type_id: 't1',
  email: null,
  phone: null,
  avatar_url: null,
  status: 'active',
  joined_at: '2026-01-01T00:00:00Z',
  card_barcode: 'MBR-ADA-1',
  created_at: '2026-01-01T00:00:00Z',
  member_type: { id: 't1', name: 'Adult' },
};

describe('MembersStore', () => {
  it('creates a member then writes a member.create audit row', async () => {
    const create = vi.fn().mockResolvedValue({ row: sampleMember, error: null });
    const list = vi.fn().mockResolvedValue({ rows: [sampleMember], total: 1, error: null });
    const listMemberTypes = vi.fn().mockResolvedValue({ rows: [], error: null });
    const log = vi.fn().mockResolvedValue({ error: null });

    await TestBed.configureTestingModule({
      providers: [
        MembersStore,
        {
          provide: MembersRepository,
          useValue: { create, list, listMemberTypes, update: vi.fn(), setStatus: vi.fn() },
        },
        { provide: AuditService, useValue: { log } },
      ],
    }).compileComponents();

    const store = TestBed.inject(MembersStore);
    const result = await store.createMember({
      name: 'Ada Lovelace',
      memberTypeId: 't1',
      email: '',
      phone: '',
      cardBarcode: 'MBR-ADA-1',
    });

    expect(result.error).toBeNull();
    expect(create).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith({
      action: 'member.create',
      entityType: 'member',
      entityId: 'm1',
      detail: { name: 'Ada Lovelace', card_barcode: 'MBR-ADA-1' },
    });
    expect(list).toHaveBeenCalled();
  });

  it('updates status through the repository RPC (audit lives in the RPC)', async () => {
    const setStatus = vi.fn().mockResolvedValue({ row: { ...sampleMember, status: 'suspended' }, error: null });
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const log = vi.fn();

    await TestBed.configureTestingModule({
      providers: [
        MembersStore,
        {
          provide: MembersRepository,
          useValue: {
            setStatus,
            list,
            listMemberTypes: vi.fn().mockResolvedValue({ rows: [], error: null }),
            create: vi.fn(),
            update: vi.fn(),
          },
        },
        { provide: AuditService, useValue: { log } },
      ],
    }).compileComponents();

    const store = TestBed.inject(MembersStore);
    const result = await store.setMemberStatus('m1', 'suspended');

    expect(result.error).toBeNull();
    expect(setStatus).toHaveBeenCalledWith('m1', 'suspended');
    expect(log).not.toHaveBeenCalled();
  });

  it('keeps member-types failures off the list error/empty signals', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [sampleMember], total: 1, error: null });
    const listMemberTypes = vi.fn().mockResolvedValue({
      rows: [],
      error: 'types unavailable',
    });

    await TestBed.configureTestingModule({
      providers: [
        MembersStore,
        {
          provide: MembersRepository,
          useValue: {
            list,
            listMemberTypes,
            create: vi.fn(),
            update: vi.fn(),
            setStatus: vi.fn(),
          },
        },
        { provide: AuditService, useValue: { log: vi.fn() } },
      ],
    }).compileComponents();

    const store = TestBed.inject(MembersStore);
    await store.init();

    expect(store.error()).toBeNull();
    expect(store.typesError()).toBe('types unavailable');
    expect(store.rows()).toEqual([sampleMember]);
    expect(store.empty()).toBe(false);
  });
});
