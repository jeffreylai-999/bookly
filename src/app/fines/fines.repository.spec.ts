import { TestBed } from '@angular/core/testing';

import {
  createPostgrestClientMock,
  createQueryBuilderMock,
} from '../core/postgrest/postgrest-access.testing';
import { SUPABASE_CLIENT } from '../core/supabase';
import { FinesRepository } from './fines.repository';

describe('FinesRepository', () => {
  it("lists a member's fine history newest-first", async () => {
    const row = {
      id: 'f1',
      member_id: 'm1',
      loan_id: 'l1',
      amount: 0.75,
      amount_paid: 0,
      reason: 'overdue',
      status: 'outstanding',
      accrual_rule_snapshot: { days_late: 3, fine_rate_per_day: 0.25 },
      created_at: '2026-08-01T10:00:00Z',
      loan: {
        id: 'l1',
        due_at: '2026-07-22T00:00:00Z',
        returned_at: '2026-08-01T00:00:00Z',
        copy: { id: 'c1', barcode: 'BK-100', titles: { title: 'Dune', author: 'Herbert' } },
      },
    };
    const builder = createQueryBuilderMock({ data: [row], error: null });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.listByMember('m1');

    expect(client.from).toHaveBeenCalledWith('fines');
    expect(builder.eq).toHaveBeenCalledWith('member_id', 'm1');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(result.error).toBeNull();
    expect(result.rows[0]?.loan?.copy?.titles?.title).toBe('Dune');
  });

  it('lists fines newest-first with the member flattened', async () => {
    const row = {
      id: 'f1',
      member_id: 'm1',
      loan_id: 'l1',
      amount: 0.75,
      amount_paid: 0,
      reason: 'overdue',
      status: 'outstanding',
      accrual_rule_snapshot: { days_late: 3, fine_rate_per_day: 0.25 },
      created_at: '2026-08-01T10:00:00Z',
      member: { id: 'm1', name: 'Ada', card_barcode: 'MBR-1' },
    };
    const builder = createQueryBuilderMock({ data: [row], error: null, count: 1 });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.list({ page: 1, pageSize: 10, status: 'all' });

    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(builder.range).toHaveBeenCalledWith(0, 9);
    expect(builder.eq).not.toHaveBeenCalled();
    expect(result.error).toBeNull();
    expect(result.total).toBe(1);
    expect(result.rows[0]?.member).toEqual({ id: 'm1', name: 'Ada', card_barcode: 'MBR-1' });
  });

  it('filters by status when one is selected', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null, count: 0 });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    await repo.list({ page: 2, pageSize: 10, status: 'outstanding' });

    expect(builder.eq).toHaveBeenCalledWith('status', 'outstanding');
    expect(builder.range).toHaveBeenCalledWith(10, 19);
  });

  it('reads desk totals from the fines_summary view', async () => {
    const builder = createQueryBuilderMock({
      data: { outstanding_balance: 11, collected_total: 14, waived_total: 4 },
      error: null,
    });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.summary();

    expect(client.from).toHaveBeenCalledWith('fines_summary');
    expect(result.error).toBeNull();
    expect(result.row).toEqual({ outstandingBalance: 11, collectedTotal: 14, waivedTotal: 4 });
  });

  it('fails the summary when the view read fails', async () => {
    const builder = createQueryBuilderMock({ data: null, error: { message: 'boom' } });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.summary();

    expect(result).toEqual({ row: null, error: 'boom' });
  });

  it('lists payments oldest-first for a fine', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    await repo.listPayments('f1');

    expect(client.from).toHaveBeenCalledWith('payments');
    expect(builder.eq).toHaveBeenCalledWith('fine_id', 'f1');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
  });

  it('recordPayment calls the RPC and maps the receipt payload', async () => {
    const payload = {
      payment: { id: 'p1', fine_id: 'f1', amount: 4, method: 'cash' },
      fine: { id: 'f1', amount: 10, amount_paid: 4, status: 'partial' },
    };
    const client = createPostgrestClientMock({ rpc: { data: payload, error: null } });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.recordPayment('f1', 4, 'cash');

    expect(client.rpc).toHaveBeenCalledWith('record_payment', {
      p_fine_id: 'f1',
      p_amount: 4,
      p_method: 'cash',
    });
    expect(result).toEqual({ ok: true, receipt: payload });
  });

  it('recordPayment maps typed RPC errors', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: null, error: { message: 'payment_exceeds_balance' } },
    });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.recordPayment('f1', 99, 'cash');

    expect(result).toEqual({ ok: false, error: 'payment_exceeds_balance' });
  });

  it('waiveFine calls the RPC and returns the updated fine', async () => {
    const fine = { id: 'f1', status: 'waived', amount_paid: 2 };
    const client = createPostgrestClientMock({ rpc: { data: fine, error: null } });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.waiveFine('f1', 'goodwill');

    expect(client.rpc).toHaveBeenCalledWith('waive_fine', {
      p_fine_id: 'f1',
      p_reason: 'goodwill',
    });
    expect(result).toEqual({ ok: true, fine });
  });

  it('waiveFine maps the admin gate', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: null, error: { message: 'admin_required' } },
    });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.waiveFine('f1', 'goodwill');

    expect(result).toEqual({ ok: false, error: 'admin_required' });
  });

  it('voidPayment calls the RPC and maps the recomputed payload', async () => {
    const payload = {
      payment: { id: 'p1', fine_id: 'f1', amount: 4, voided_by: 'admin' },
      fine: { id: 'f1', amount: 10, amount_paid: 0, status: 'outstanding' },
    };
    const client = createPostgrestClientMock({ rpc: { data: payload, error: null } });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.voidPayment('p1', 'wrong amount');

    expect(client.rpc).toHaveBeenCalledWith('void_payment', {
      p_payment_id: 'p1',
      p_reason: 'wrong amount',
    });
    expect(result).toEqual({ ok: true, ...payload });
  });

  it('voidPayment maps typed RPC errors', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: null, error: { message: 'payment_already_voided' } },
    });

    TestBed.configureTestingModule({
      providers: [FinesRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(FinesRepository);
    const result = await repo.voidPayment('p1', 'again');

    expect(result).toEqual({ ok: false, error: 'payment_already_voided' });
  });
});
