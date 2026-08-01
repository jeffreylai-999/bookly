import { TestBed } from '@angular/core/testing';

import { CirculationRepository } from './circulation.repository';
import { CirculationStore } from './circulation.store';
import type { CheckoutCopy, CheckoutMember } from './circulation.types';

const member: CheckoutMember = {
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
  member_type: {
    id: 't1',
    name: 'Adult',
    loan_period_days: 21,
    borrow_cap: 10,
  },
};

const copy: CheckoutCopy = {
  id: 'c1',
  barcode: 'BK-001',
  status: 'available',
  title_id: 't1',
  title: 'Dune',
  author: 'Herbert',
};

describe('CirculationStore', () => {
  it('selects a member by card barcode', async () => {
    const findMemberByCard = vi.fn().mockResolvedValue({ row: member, error: null });

    await TestBed.configureTestingModule({
      providers: [
        CirculationStore,
        {
          provide: CirculationRepository,
          useValue: {
            findMemberByCard,
            findCopyByBarcode: vi.fn(),
            searchMembers: vi.fn(),
            checkout: vi.fn(),
            getMemberMoney: vi.fn().mockResolvedValue({ row: null, error: null }),
            getSettings: vi.fn().mockResolvedValue({ row: null, error: null }),
          },
        },
      ],
    }).compileComponents();

    const store = TestBed.inject(CirculationStore);
    const result = await store.selectMemberByCard('MBR-ADA-1');

    expect(result.error).toBeNull();
    expect(store.member()?.id).toBe('m1');
    expect(findMemberByCard).toHaveBeenCalledWith('MBR-ADA-1');
  });

  it('queues an available copy and rejects duplicates', async () => {
    const findCopyByBarcode = vi
      .fn()
      .mockResolvedValueOnce({ row: copy, error: null })
      .mockResolvedValueOnce({ row: copy, error: null });

    await TestBed.configureTestingModule({
      providers: [
        CirculationStore,
        {
          provide: CirculationRepository,
          useValue: {
            findMemberByCard: vi.fn(),
            findCopyByBarcode,
            searchMembers: vi.fn(),
            checkout: vi.fn(),
            getMemberMoney: vi.fn().mockResolvedValue({ row: null, error: null }),
            getSettings: vi.fn().mockResolvedValue({ row: null, error: null }),
          },
        },
      ],
    }).compileComponents();

    const store = TestBed.inject(CirculationStore);
    store.setMember(member);

    const first = await store.queueCopyByBarcode('BK-001');
    expect(first.error).toBeNull();
    expect(store.queuedCopies()).toHaveLength(1);

    const second = await store.queueCopyByBarcode('BK-001');
    expect(second.error).toBe('duplicate_barcode');
    expect(store.queuedCopies()).toHaveLength(1);
  });

  it('queues a shelf copy for server-side hold ownership enforcement', async () => {
    const shelfCopy: CheckoutCopy = { ...copy, status: 'on_hold_shelf' };

    await TestBed.configureTestingModule({
      providers: [
        CirculationStore,
        {
          provide: CirculationRepository,
          useValue: {
            findMemberByCard: vi.fn(),
            findCopyByBarcode: vi.fn().mockResolvedValue({ row: shelfCopy, error: null }),
            searchMembers: vi.fn(),
            checkout: vi.fn(),
            getMemberMoney: vi.fn().mockResolvedValue({ row: null, error: null }),
            getSettings: vi.fn().mockResolvedValue({ row: null, error: null }),
          },
        },
      ],
    }).compileComponents();

    const store = TestBed.inject(CirculationStore);

    const result = await store.queueCopyByBarcode('BK-001');

    expect(result.error).toBeNull();
    expect(store.queuedCopies()).toEqual([shelfCopy]);
  });

  it('confirms checkout then clears the queue', async () => {
    const checkout = vi.fn().mockResolvedValue({
      ok: true,
      loans: [
        {
          id: 'l1',
          copy_id: 'c1',
          member_id: 'm1',
          checked_out_by: 'p1',
          checked_out_at: '2026-08-01T00:00:00Z',
          due_at: '2026-08-22T00:00:00Z',
          returned_at: null,
          renew_count: 0,
          status: 'active',
          created_at: '2026-08-01T00:00:00Z',
        },
      ],
    });

    await TestBed.configureTestingModule({
      providers: [
        CirculationStore,
        {
          provide: CirculationRepository,
          useValue: {
            findMemberByCard: vi.fn(),
            findCopyByBarcode: vi.fn().mockResolvedValue({ row: copy, error: null }),
            searchMembers: vi.fn(),
            checkout,
            getMemberMoney: vi.fn().mockResolvedValue({ row: null, error: null }),
            getSettings: vi.fn().mockResolvedValue({ row: null, error: null }),
          },
        },
      ],
    }).compileComponents();

    const store = TestBed.inject(CirculationStore);
    store.setMember(member);
    await store.queueCopyByBarcode('BK-001');

    const result = await store.confirmCheckout();

    expect(result).toEqual({ ok: true });
    expect(checkout).toHaveBeenCalledWith('m1', ['BK-001']);
    expect(store.queuedCopies()).toHaveLength(0);
    expect(store.lastDueAt()).toBe('2026-08-22T00:00:00Z');
  });

  it('surfaces typed checkout gate errors without clearing the queue', async () => {
    const checkout = vi.fn().mockResolvedValue({ ok: false, error: 'member_borrow_cap' });

    await TestBed.configureTestingModule({
      providers: [
        CirculationStore,
        {
          provide: CirculationRepository,
          useValue: {
            findMemberByCard: vi.fn(),
            findCopyByBarcode: vi.fn().mockResolvedValue({ row: copy, error: null }),
            searchMembers: vi.fn(),
            checkout,
            getMemberMoney: vi.fn().mockResolvedValue({ row: null, error: null }),
            getSettings: vi.fn().mockResolvedValue({ row: null, error: null }),
          },
        },
      ],
    }).compileComponents();

    const store = TestBed.inject(CirculationStore);
    store.setMember(member);
    await store.queueCopyByBarcode('BK-001');

    const result = await store.confirmCheckout();

    expect(result).toEqual({ ok: false, error: 'member_borrow_cap' });
    expect(store.queuedCopies()).toHaveLength(1);
  });

  it('loads balance and projected for the member panel, cleared on reset', async () => {
    const getMemberMoney = vi
      .fn()
      .mockResolvedValue({ row: { balance: 12, projected: 0.75 }, error: null });
    const getSettings = vi
      .fn()
      .mockResolvedValue({ row: { currency: 'EUR', damaged_fee_default: 10 }, error: null });

    await TestBed.configureTestingModule({
      providers: [
        CirculationStore,
        {
          provide: CirculationRepository,
          useValue: {
            findMemberByCard: vi.fn(),
            findCopyByBarcode: vi.fn(),
            searchMembers: vi.fn(),
            checkout: vi.fn(),
            getMemberMoney,
            getSettings,
          },
        },
      ],
    }).compileComponents();

    const store = TestBed.inject(CirculationStore);
    store.setMember(member);
    // loadMoney is fire-and-forget; let the microtask queue flush.
    await vi.waitFor(() => expect(store.money()).toEqual({ balance: 12, projected: 0.75 }));

    expect(getMemberMoney).toHaveBeenCalledWith('m1');
    expect(store.currency()).toBe('EUR');

    store.reset();
    expect(store.money()).toBeNull();
  });
});
