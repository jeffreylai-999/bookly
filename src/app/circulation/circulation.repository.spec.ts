import { TestBed } from '@angular/core/testing';

import {
  createPostgrestClientMock,
  createQueryBuilderMock,
} from '../core/postgrest/postgrest-access.testing';
import { SUPABASE_CLIENT } from '../core/supabase';
import { CirculationRepository } from './circulation.repository';

describe('CirculationRepository', () => {
  it('finds a member by card barcode with member type rules', async () => {
    const builder = createQueryBuilderMock({
      data: {
        id: 'm1',
        name: 'Ada',
        member_type_id: 't1',
        email: null,
        phone: null,
        avatar_url: null,
        status: 'active',
        joined_at: '2026-01-01T00:00:00Z',
        card_barcode: 'MBR-1001',
        created_at: '2026-01-01T00:00:00Z',
        member_type: {
          id: 't1',
          name: 'Adult',
          loan_period_days: 21,
          borrow_cap: 10,
        },
      },
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.findMemberByCard('MBR-1001');

    expect(client.from).toHaveBeenCalledWith('members');
    expect(result.error).toBeNull();
    expect(result.row?.card_barcode).toBe('MBR-1001');
    expect(result.row?.member_type?.loan_period_days).toBe(21);
  });

  it('finds a copy by barcode with title fields', async () => {
    const builder = createQueryBuilderMock({
      data: {
        id: 'c1',
        barcode: 'BK-DUNE-001',
        status: 'available',
        title_id: 't1',
        titles: { title: 'Dune', author: 'Herbert' },
      },
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.findCopyByBarcode('BK-DUNE-001');

    expect(result.error).toBeNull();
    expect(result.row).toEqual({
      id: 'c1',
      barcode: 'BK-DUNE-001',
      status: 'available',
      title_id: 't1',
      title: 'Dune',
      author: 'Herbert',
    });
  });

  it('maps checkout RPC gate errors to typed codes', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: null, error: { message: 'member_suspended' } },
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkout('m1', ['BK-001']);

    expect(client.rpc).toHaveBeenCalledWith('checkout', {
      p_member_id: 'm1',
      p_copy_barcodes: ['BK-001'],
    });
    expect(result).toEqual({ ok: false, error: 'member_suspended' });
  });

  it('returns loans on successful checkout', async () => {
    const loan = {
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
    };
    const client = createPostgrestClientMock({
      rpc: { data: [loan], error: null },
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkout('m1', ['BK-001']);

    expect(result).toEqual({ ok: true, loans: [loan] });
  });

  it('resolves an active loan by copy barcode with copy and member flattened', async () => {
    const builder = createQueryBuilderMock({
      data: {
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
        copy: {
          id: 'c1',
          barcode: 'BK-100',
          status: 'on_loan',
          title_id: 't1',
          titles: { title: 'Dune', author: 'Herbert' },
        },
        member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
      },
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.findActiveLoanByBarcode('BK-100');

    expect(client.from).toHaveBeenCalledWith('loans');
    expect(builder.eq).toHaveBeenCalledWith('status', 'active');
    expect(builder.eq).toHaveBeenCalledWith('copy.barcode', 'BK-100');
    expect(result.error).toBeNull();
    expect(result.row).toEqual({
      loan: {
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
      },
      copy: {
        id: 'c1',
        barcode: 'BK-100',
        status: 'on_loan',
        title_id: 't1',
        title: 'Dune',
        author: 'Herbert',
      },
      member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
    });
  });

  it('reads the overdue projection from the overdue_loans view', async () => {
    const projection = {
      loan_id: 'l1',
      copy_id: 'c1',
      copy_barcode: 'BK-100',
      title_id: 't1',
      title: 'Dune',
      author: 'Herbert',
      member_id: 'm1',
      member_name: 'Ada',
      member_card_barcode: 'MBR-1',
      checked_out_at: '2026-07-01T00:00:00Z',
      due_at: '2026-07-22T00:00:00Z',
      days_late: 3,
      fine_rate_per_day: 0.25,
      projected_fine: 0.75,
    };
    const builder = createQueryBuilderMock({ data: projection, error: null });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.getOverdueProjection('l1');

    expect(client.from).toHaveBeenCalledWith('overdue_loans');
    expect(result.error).toBeNull();
    expect(result.row?.days_late).toBe(3);
    expect(result.row?.projected_fine).toBe(0.75);
  });

  it('maps the checkin RPC payload into a typed success', async () => {
    const payload = {
      loan: {
        id: 'l1',
        copy_id: 'c1',
        member_id: 'm1',
        checked_out_by: 'p1',
        checked_out_at: '2026-07-01T00:00:00Z',
        due_at: '2026-07-22T00:00:00Z',
        returned_at: '2026-08-01T10:00:00Z',
        renew_count: 0,
        status: 'returned',
        created_at: '2026-07-01T00:00:00Z',
      },
      copy_id: 'c1',
      barcode: 'BK-100',
      copy_status: 'available',
      condition: 'ok',
      days_late: 3,
      fines: [
        {
          id: 'f1',
          member_id: 'm1',
          loan_id: 'l1',
          reason: 'overdue',
          amount: 0.75,
          status: 'outstanding',
          accrual_rule_snapshot: { days_late: 3, fine_rate_per_day: 0.25 },
          created_at: '2026-08-01T10:00:00Z',
        },
      ],
      hold: null,
    };
    const client = createPostgrestClientMock({
      rpc: { data: payload, error: null },
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkin('BK-100', 'ok');

    expect(client.rpc).toHaveBeenCalledWith('checkin', {
      p_copy_barcode: 'BK-100',
      p_condition: 'ok',
    });
    expect(result).toEqual({
      ok: true,
      loan: payload.loan,
      copyStatus: 'available',
      condition: 'ok',
      daysLate: 3,
      fines: payload.fines,
      hold: null,
    });
  });

  it('passes the fill-hold choice to the checkin RPC and maps the readied hold', async () => {
    const payload = {
      loan: {
        id: 'l1',
        copy_id: 'c1',
        member_id: 'm1',
        checked_out_by: 'p1',
        checked_out_at: '2026-07-01T00:00:00Z',
        due_at: '2026-07-22T00:00:00Z',
        returned_at: '2026-08-01T10:00:00Z',
        renew_count: 0,
        status: 'returned',
        created_at: '2026-07-01T00:00:00Z',
      },
      copy_id: 'c1',
      barcode: 'BK-100',
      copy_status: 'on_hold_shelf',
      condition: 'ok',
      days_late: null,
      fines: [],
      hold: {
        id: 'h1',
        member_id: 'm2',
        member_name: 'Grace',
        copy_barcode: 'BK-100',
        expires_at: '2026-08-08T10:00:00Z',
      },
    };
    const client = createPostgrestClientMock({
      rpc: { data: payload, error: null },
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkin('BK-100', 'ok', undefined, true);

    expect(client.rpc).toHaveBeenCalledWith('checkin', {
      p_copy_barcode: 'BK-100',
      p_condition: 'ok',
      p_fill_hold: true,
    });
    expect(result).toEqual({
      ok: true,
      loan: payload.loan,
      copyStatus: 'on_hold_shelf',
      condition: 'ok',
      daysLate: null,
      fines: [],
      hold: payload.hold,
    });
  });

  it('counts waiting holds for a title', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null, count: 3 });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.countWaitingHolds('t1');

    expect(client.from).toHaveBeenCalledWith('holds');
    expect(builder.eq).toHaveBeenCalledWith('title_id', 't1');
    expect(builder.eq).toHaveBeenCalledWith('status', 'waiting');
    expect(result).toEqual({ count: 3, error: null });
  });

  it('passes the damaged override amount to the checkin RPC', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: null, error: { message: 'loan_not_found' } },
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.checkin('BK-100', 'damaged', 7.5);

    expect(client.rpc).toHaveBeenCalledWith('checkin', {
      p_copy_barcode: 'BK-100',
      p_condition: 'damaged',
      p_damaged_amount: 7.5,
    });
    expect(result).toEqual({ ok: false, error: 'loan_not_found' });
  });

  it('renews a loan via the renew_loan RPC and returns the updated row', async () => {
    const loan = {
      id: 'l1',
      copy_id: 'c1',
      member_id: 'm1',
      checked_out_by: 'p1',
      checked_out_at: '2026-07-01T00:00:00Z',
      due_at: '2026-08-22T00:00:00Z',
      returned_at: null,
      renew_count: 1,
      status: 'active',
      created_at: '2026-07-01T00:00:00Z',
    };
    const client = createPostgrestClientMock({
      rpc: { data: loan, error: null },
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.renew('l1');

    expect(client.rpc).toHaveBeenCalledWith('renew_loan', { p_loan_id: 'l1' });
    expect(result).toEqual({ ok: true, loan });
  });

  it('maps renew RPC gate errors to typed codes', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: null, error: { message: 'loan_overdue' } },
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.renew('l1');

    expect(result).toEqual({ ok: false, error: 'loan_overdue' });
  });

  it('maps renew errors carrying the code in a longer message', async () => {
    const client = createPostgrestClientMock({
      rpc: {
        data: null,
        error: { message: 'renewal_limit_reached: raise exception' },
      },
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.renew('l1');

    expect(result).toEqual({ ok: false, error: 'renewal_limit_reached' });
  });

  it('lists active and returned loans with copy and member flattened', async () => {
    const row = {
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
      copy: { id: 'c1', barcode: 'BK-100', titles: { title: 'Dune', author: 'Herbert' } },
      member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
    };
    const builder = createQueryBuilderMock({ data: [row], error: null, count: 1 });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.listLoans('active', { page: 1, pageSize: 10 });

    expect(builder.order).toHaveBeenCalledWith('due_at', { ascending: true });
    expect(result.error).toBeNull();
    expect(result.total).toBe(1);
    expect(result.rows[0]?.copy).toEqual({
      id: 'c1',
      barcode: 'BK-100',
      title: 'Dune',
      author: 'Herbert',
    });
    expect(result.rows[0]?.member).toEqual({ id: 'm1', name: 'Ada', card_barcode: 'MBR-1' });
  });

  it("lists a member's active loans, soonest due first", async () => {
    const row = {
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
      copy: { id: 'c1', barcode: 'BK-100', titles: { title: 'Dune', author: 'Herbert' } },
      member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
    };
    const builder = createQueryBuilderMock({ data: [row], error: null });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.listActiveLoansByMember('m1');

    expect(client.from).toHaveBeenCalledWith('loans');
    expect(builder.eq).toHaveBeenCalledWith('member_id', 'm1');
    expect(builder.eq).toHaveBeenCalledWith('status', 'active');
    expect(builder.order).toHaveBeenCalledWith('due_at', { ascending: true });
    expect(result.error).toBeNull();
    expect(result.rows[0]?.copy).toEqual({
      id: 'c1',
      barcode: 'BK-100',
      title: 'Dune',
      author: 'Herbert',
    });
  });

  it('lists overdue loans from the overdue_loans view, most days late first', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null, count: 0 });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.listOverdue({ page: 2, pageSize: 10 });

    expect(client.from).toHaveBeenCalledWith('overdue_loans');
    expect(builder.order).toHaveBeenCalledWith('days_late', { ascending: false });
    expect(builder.order).toHaveBeenCalledWith('due_at', { ascending: true });
    expect(builder.range).toHaveBeenCalledWith(10, 19);
    expect(result.error).toBeNull();
  });

  it('lists due-today loans from the due_today_loans view, earliest due first', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null, count: 0 });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.listDueToday({ page: 1, pageSize: 5 });

    expect(client.from).toHaveBeenCalledWith('due_today_loans');
    expect(builder.order).toHaveBeenCalledWith('due_at', { ascending: true });
    expect(result.error).toBeNull();
    expect(result.rows).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('reads the 14-day checkout trend, oldest day first', async () => {
    const trend = [
      { day: '2026-07-21', checkouts: 0 },
      { day: '2026-07-22', checkouts: 2 },
    ];
    const builder = createQueryBuilderMock({ data: trend, error: null });
    const client = createPostgrestClientMock({ from: builder });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.getCheckoutTrend();

    expect(client.from).toHaveBeenCalledWith('checkout_trend');
    expect(builder.order).toHaveBeenCalledWith('day', { ascending: true });
    expect(result.error).toBeNull();
    expect(result.rows).toEqual(trend);
  });

  it('sums materialized balance and projected fines for the member panel', async () => {
    const finesBuilder = createQueryBuilderMock({
      data: [
        { amount: 10, amount_paid: 4 },
        { amount: 5, amount_paid: 0 },
      ],
      error: null,
    });
    const overdueBuilder = createQueryBuilderMock({
      data: [{ projected_fine: 0.75 }, { projected_fine: 0.25 }],
      error: null,
    });
    const client = createPostgrestClientMock({
      from: (table) => (table === 'fines' ? finesBuilder : overdueBuilder),
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.getMemberMoney('m1');

    // Gate sum: materialized outstanding/partial fines only.
    expect(finesBuilder.in).toHaveBeenCalledWith('status', ['outstanding', 'partial']);
    expect(result.error).toBeNull();
    expect(result.row).toEqual({ balance: 11, projected: 1 });
  });

  it('fails the money read when the fines query fails', async () => {
    const client = createPostgrestClientMock({
      from: createQueryBuilderMock({ data: null, error: { message: 'boom' } }),
    });

    await TestBed.configureTestingModule({
      providers: [CirculationRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    }).compileComponents();

    const repo = TestBed.inject(CirculationRepository);
    const result = await repo.getMemberMoney('m1');

    expect(result).toEqual({ row: null, error: 'boom' });
  });
});
