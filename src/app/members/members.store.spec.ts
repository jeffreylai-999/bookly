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
    const setStatus = vi
      .fn()
      .mockResolvedValue({ row: { ...sampleMember, status: 'suspended' }, error: null });
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

  it('reloads page 1 when a populated result makes the selected page out of range', async () => {
    const list = vi
      .fn()
      .mockImplementation(({ page }: { page: number }) =>
        Promise.resolve(
          page === 2
            ? { rows: [], total: 1, error: null }
            : { rows: [sampleMember], total: 1, error: null },
        ),
      );

    await TestBed.configureTestingModule({
      providers: [
        MembersStore,
        {
          provide: MembersRepository,
          useValue: {
            list,
            listMemberTypes: vi.fn().mockResolvedValue({ rows: [], error: null }),
            create: vi.fn(),
            update: vi.fn(),
            setStatus: vi.fn(),
          },
        },
        { provide: AuditService, useValue: { log: vi.fn() } },
      ],
    }).compileComponents();

    const store = TestBed.inject(MembersStore);
    store.setPage(2);

    await vi.waitFor(() =>
      expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 })),
    );
    expect(store.page()).toBe(1);
    expect(store.rows()).toEqual([sampleMember]);
  });

  it('clears a pre-existing list error before setMemberStatus calls the repository, even if the mutation fails', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], total: 0, error: 'load boom' })
      .mockResolvedValue({ rows: [], total: 0, error: null });
    let resolveSetStatus: (value: { row: null; error: string }) => void = () => undefined;
    const setStatus = vi.fn(
      () =>
        new Promise<{ row: null; error: string }>((resolve) => {
          resolveSetStatus = resolve;
        }),
    );

    await TestBed.configureTestingModule({
      providers: [
        MembersStore,
        {
          provide: MembersRepository,
          useValue: {
            list,
            listMemberTypes: vi.fn().mockResolvedValue({ rows: [], error: null }),
            create: vi.fn(),
            update: vi.fn(),
            setStatus,
          },
        },
        { provide: AuditService, useValue: { log: vi.fn() } },
      ],
    }).compileComponents();

    const store = TestBed.inject(MembersStore);
    await store.load();
    expect(store.error()).toBe('load_failed');

    const pending = store.setMemberStatus('m1', 'suspended');
    // The pre-existing list error must clear before the mutation settles —
    // it is unrelated to this action's own outcome, and the mutation's
    // early-return-on-failure path never issues a reload to clear it itself.
    await vi.waitFor(() => expect(setStatus).toHaveBeenCalled());
    expect(store.error()).toBeNull();

    resolveSetStatus({ row: null, error: 'member_not_found' });
    const result = await pending;

    expect(result.error).toBe('member_not_found');
    expect(store.error()).toBeNull();
  });

  it('clears a pre-existing list error before a member save mutation, even if the save fails', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], total: 0, error: 'load boom' })
      .mockResolvedValue({ rows: [], total: 0, error: null });
    const update = vi.fn().mockResolvedValue({ row: null, error: 'card_barcode_taken' });

    await TestBed.configureTestingModule({
      providers: [
        MembersStore,
        {
          provide: MembersRepository,
          useValue: {
            list,
            listMemberTypes: vi.fn().mockResolvedValue({ rows: [], error: null }),
            create: vi.fn(),
            update,
            setStatus: vi.fn(),
          },
        },
        { provide: AuditService, useValue: { log: vi.fn() } },
      ],
    }).compileComponents();

    const store = TestBed.inject(MembersStore);
    await store.load();
    expect(store.error()).toBe('load_failed');

    const result = await store.updateMember('m1', {
      name: 'Ada Lovelace',
      memberTypeId: 't1',
      email: '',
      phone: '',
      cardBarcode: 'DUPLICATE',
    });

    expect(result.error).toBe('card_barcode_taken');
    expect(store.error()).toBeNull();
  });
});
