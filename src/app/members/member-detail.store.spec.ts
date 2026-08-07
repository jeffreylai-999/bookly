import { TestBed } from '@angular/core/testing';

import { CirculationRepository } from '../circulation/circulation.repository';
import type { LoanListItem } from '../circulation/circulation.types';
import { AppSettingsService } from '../core/app-settings';
import { FinesRepository } from '../fines/fines.repository';
import type { FineListItem } from '../fines/fines.types';
import { HoldsRepository } from '../holds/holds.repository';
import type { HoldListItem } from '../holds/holds.types';
import { MemberDetailStore } from './member-detail.store';
import { MembersRepository } from './members.repository';
import type { MemberListItem } from './members.types';

function memberRow(overrides: Partial<MemberListItem> = {}): MemberListItem {
  return {
    id: 'm1',
    name: 'Ada Lovelace',
    member_type_id: 't1',
    email: 'ada@example.com',
    phone: '555-0100',
    avatar_url: null,
    status: 'active',
    joined_at: '2026-01-15T00:00:00Z',
    card_barcode: 'MBR-ADA-1',
    created_at: '2026-01-15T00:00:00Z',
    member_type: { id: 't1', name: 'Adult' },
    ...overrides,
  };
}

function loanRow(overrides: Partial<LoanListItem> = {}): LoanListItem {
  return {
    id: 'l1',
    copy_id: 'c1',
    member_id: 'm1',
    checked_out_by: 'p1',
    checked_out_at: '2026-07-01T00:00:00Z',
    due_at: '2026-07-22T00:00:00Z',
    returned_at: null,
    renew_count: 0,
    status: 'active',
    created_at: '2026-07-01T00:00:00Z',
    copy: { id: 'c1', barcode: 'BK-100', title: 'Dune', author: 'Herbert' },
    member: { id: 'm1', name: 'Ada Lovelace', card_barcode: 'MBR-ADA-1' },
    ...overrides,
  };
}

function holdRow(overrides: Partial<HoldListItem> = {}): HoldListItem {
  return {
    id: 'h1',
    title_id: 't1',
    member_id: 'm1',
    queue_position: 1,
    status: 'waiting',
    copy_id: null,
    ready_at: null,
    expires_at: null,
    created_at: '2026-07-20T00:00:00Z',
    title: { title: 'Foundation', author: 'Asimov' },
    member: { name: 'Ada Lovelace', card_barcode: 'MBR-ADA-1' },
    copy: null,
    ...overrides,
  };
}

function fineRow(overrides: Partial<FineListItem> = {}): FineListItem {
  return {
    id: 'f1',
    member_id: 'm1',
    loan_id: 'l0',
    amount: 0.75,
    amount_paid: 0,
    reason: 'overdue',
    status: 'outstanding',
    accrual_rule_snapshot: { days_late: 3, fine_rate_per_day: 0.25 },
    created_at: '2026-08-01T10:00:00Z',
    member: { id: 'm1', name: 'Ada Lovelace', card_barcode: 'MBR-ADA-1' },
    loan: null,
    ...overrides,
  };
}

function setup(
  overrides: {
    members?: Record<string, unknown>;
    circulation?: Record<string, unknown>;
    holds?: Record<string, unknown>;
    fines?: Record<string, unknown>;
  } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      MemberDetailStore,
      {
        provide: AppSettingsService,
        useValue: {
          currency: () => 'EUR',
          load: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: MembersRepository,
        useValue: {
          getById: vi.fn().mockResolvedValue({ row: memberRow(), error: null }),
          setStatus: vi
            .fn()
            .mockResolvedValue({ row: memberRow({ status: 'suspended' }), error: null }),
          ...overrides.members,
        },
      },
      {
        provide: CirculationRepository,
        useValue: {
          listActiveLoansByMember: vi.fn().mockResolvedValue({ rows: [], error: null }),
          getMemberMoney: vi
            .fn()
            .mockResolvedValue({ row: { balance: 0, projected: 0 }, error: null }),
          renew: vi.fn().mockResolvedValue({ ok: true, loan: loanRow() }),
          ...overrides.circulation,
        },
      },
      {
        provide: HoldsRepository,
        useValue: {
          listByMember: vi.fn().mockResolvedValue({ rows: [], error: null }),
          ...overrides.holds,
        },
      },
      {
        provide: FinesRepository,
        useValue: {
          listByMember: vi.fn().mockResolvedValue({ rows: [], error: null }),
          ...overrides.fines,
        },
      },
    ],
  });
  return TestBed.inject(MemberDetailStore);
}

describe('MemberDetailStore', () => {
  it('loads the member, loans, holds, fines, money, and currency together', async () => {
    const store = setup({
      circulation: {
        listActiveLoansByMember: vi.fn().mockResolvedValue({ rows: [loanRow()], error: null }),
        getMemberMoney: vi
          .fn()
          .mockResolvedValue({ row: { balance: 5, projected: 1.5 }, error: null }),
      },
      holds: { listByMember: vi.fn().mockResolvedValue({ rows: [holdRow()], error: null }) },
      fines: { listByMember: vi.fn().mockResolvedValue({ rows: [fineRow()], error: null }) },
    });

    await store.init('m1');

    expect(store.member()?.name).toBe('Ada Lovelace');
    expect(store.notFound()).toBe(false);
    expect(store.loans()).toEqual([loanRow()]);
    expect(store.holds()).toEqual([holdRow()]);
    expect(store.fines()).toEqual([fineRow()]);
    expect(store.money()).toEqual({ balance: 5, projected: 1.5 });
    expect(store.currency()).toBe('EUR');
  });

  it("clears the previous member's data immediately when navigating to a new one", async () => {
    const member2 = memberRow({ id: 'm2', name: 'Grace Hopper' });
    let resolveGetById!: (value: { row: MemberListItem | null; error: string | null }) => void;
    const getById = vi
      .fn()
      .mockResolvedValueOnce({ row: memberRow(), error: null })
      .mockImplementationOnce(() => new Promise((resolve) => (resolveGetById = resolve)));
    const store = setup({
      members: { getById },
      circulation: {
        listActiveLoansByMember: vi.fn().mockResolvedValue({ rows: [loanRow()], error: null }),
        getMemberMoney: vi
          .fn()
          .mockResolvedValue({ row: { balance: 5, projected: 1.5 }, error: null }),
      },
      holds: { listByMember: vi.fn().mockResolvedValue({ rows: [holdRow()], error: null }) },
      fines: { listByMember: vi.fn().mockResolvedValue({ rows: [fineRow()], error: null }) },
    });
    await store.init('m1');
    expect(store.member()?.name).toBe('Ada Lovelace');

    // Navigating to a second member reuses this store instance (same routed
    // component). Before the second getById resolves, the first member's
    // panels — and any action a click could fire against them — must
    // already be gone, not lingering until the new fetch completes.
    const secondInit = store.init('m2');
    expect(store.member()).toBeNull();
    expect(store.loans()).toEqual([]);
    expect(store.holds()).toEqual([]);
    expect(store.fines()).toEqual([]);
    expect(store.money()).toBeNull();

    resolveGetById({ row: member2, error: null });
    await secondInit;

    expect(store.member()).toEqual(member2);
  });

  it('flags a missing member without treating it as a load error', async () => {
    const store = setup({
      members: { getById: vi.fn().mockResolvedValue({ row: null, error: null }) },
    });

    await store.init('missing');

    expect(store.notFound()).toBe(true);
    expect(store.memberError()).toBeNull();
  });

  it('surfaces a member load failure', async () => {
    const store = setup({
      members: { getById: vi.fn().mockResolvedValue({ row: null, error: 'boom' }) },
    });

    await store.init('m1');

    expect(store.memberError()).toBe('boom');
    expect(store.notFound()).toBe(false);
  });

  it('surfaces independent load errors for loans, holds, and fines', async () => {
    const store = setup({
      circulation: {
        listActiveLoansByMember: vi.fn().mockResolvedValue({ rows: [], error: 'loans_down' }),
      },
      holds: { listByMember: vi.fn().mockResolvedValue({ rows: [], error: 'holds_down' }) },
      fines: { listByMember: vi.fn().mockResolvedValue({ rows: [], error: 'fines_down' }) },
    });

    await store.init('m1');

    expect(store.loansError()).toBe('loans_down');
    expect(store.holdsError()).toBe('holds_down');
    expect(store.finesError()).toBe('fines_down');
  });

  it('changes member status through the RPC and reloads the member', async () => {
    const getById = vi
      .fn()
      .mockResolvedValueOnce({ row: memberRow(), error: null })
      .mockResolvedValueOnce({ row: memberRow({ status: 'suspended' }), error: null });
    const setStatus = vi
      .fn()
      .mockResolvedValue({ row: memberRow({ status: 'suspended' }), error: null });
    const store = setup({ members: { getById, setStatus } });
    await store.init('m1');

    const result = await store.setMemberStatus('suspended');

    expect(setStatus).toHaveBeenCalledWith('m1', 'suspended');
    expect(result.error).toBeNull();
    expect(store.member()?.status).toBe('suspended');
  });

  it('renews a loan and refreshes loans and money', async () => {
    const renewedLoan = loanRow({ due_at: '2026-08-12T00:00:00Z' });
    const listActiveLoansByMember = vi
      .fn()
      .mockResolvedValueOnce({ rows: [loanRow()], error: null })
      .mockResolvedValueOnce({ rows: [renewedLoan], error: null });
    const getMemberMoney = vi
      .fn()
      .mockResolvedValue({ row: { balance: 0, projected: 0 }, error: null });
    const renew = vi.fn().mockResolvedValue({ ok: true, loan: renewedLoan });
    const store = setup({
      circulation: { listActiveLoansByMember, getMemberMoney, renew },
    });
    await store.init('m1');
    getMemberMoney.mockClear();

    const result = await store.renew(loanRow());

    expect(renew).toHaveBeenCalledWith('l1');
    expect(result).toEqual({ ok: true, loan: renewedLoan });
    expect(store.loans()).toEqual([renewedLoan]);
    expect(getMemberMoney).toHaveBeenCalled();
    expect(store.renewingId()).toBeNull();
  });

  it('does not reload after a rejected renewal', async () => {
    const listActiveLoansByMember = vi.fn().mockResolvedValue({ rows: [loanRow()], error: null });
    const renew = vi.fn().mockResolvedValue({ ok: false, error: 'loan_overdue' });
    const store = setup({ circulation: { listActiveLoansByMember, renew } });
    await store.init('m1');
    listActiveLoansByMember.mockClear();

    const result = await store.renew(loanRow());

    expect(result).toEqual({ ok: false, error: 'loan_overdue' });
    expect(listActiveLoansByMember).not.toHaveBeenCalled();
  });
});
