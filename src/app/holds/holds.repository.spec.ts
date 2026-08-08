import { TestBed } from '@angular/core/testing';

import {
  createPostgrestClientMock,
  createQueryBuilderMock,
} from '../core/postgrest/postgrest-access.testing';
import { SUPABASE_CLIENT } from '../core/supabase';
import { HoldsRepository } from './holds.repository';

const holdRow = {
  id: 'h1',
  title_id: 't1',
  member_id: 'm1',
  queue_position: 1,
  status: 'waiting',
  copy_id: null,
  ready_at: null,
  expires_at: null,
  created_at: '2026-07-20T00:00:00Z',
  title: { title: 'Dune', author: 'Herbert' },
  member: { name: 'Ada', card_barcode: 'MBR-1' },
  copy: null,
};

describe('HoldsRepository', () => {
  it('lists holds oldest first with title, member, and copy joined', async () => {
    const builder = createQueryBuilderMock({ data: [holdRow], error: null, count: 1 });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.listHolds('waiting', { page: 1, pageSize: 10 });

    expect(client.from).toHaveBeenCalledWith('holds');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(builder.eq).toHaveBeenCalledWith('status', 'waiting');
    expect(builder.range).toHaveBeenCalledWith(0, 9);
    expect(result.error).toBeNull();
    expect(result.total).toBe(1);
    expect(result.rows[0]?.title?.title).toBe('Dune');
    expect(result.rows[0]?.member?.name).toBe('Ada');
  });

  it('skips the status filter for the all option', async () => {
    const builder = createQueryBuilderMock({ data: [], error: null, count: 0 });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    await repo.listHolds('', { page: 1, pageSize: 10 });

    expect(builder.eq).not.toHaveBeenCalled();
  });

  it("lists a member's holds oldest first with title and copy joined", async () => {
    const builder = createQueryBuilderMock({ data: [holdRow], error: null });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.listByMember('m1');

    expect(client.from).toHaveBeenCalledWith('holds');
    expect(builder.eq).toHaveBeenCalledWith('member_id', 'm1');
    expect(builder.order).toHaveBeenCalledWith('created_at', { ascending: true });
    expect(result.error).toBeNull();
    expect(result.rows[0]?.title?.title).toBe('Dune');
  });

  it('marks ready with the title and copy barcode — never a hold id', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: { ...holdRow, status: 'ready' }, error: null },
    });

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.markReady('t1', ' BK-001 ');

    expect(client.rpc).toHaveBeenCalledWith('mark_ready', {
      p_title_id: 't1',
      p_copy_barcode: 'BK-001',
    });
    expect(result).toEqual({ ok: true, hold: { ...holdRow, status: 'ready' } });
  });

  it('maps mark_ready RPC errors to typed codes', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: null, error: { message: 'copy_not_available' } },
    });

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.markReady('t1', 'BK-001');

    expect(result).toEqual({ ok: false, error: 'copy_not_available' });
  });

  it('counts holds by status for the Overview stat card', async () => {
    const builder = createQueryBuilderMock({ data: null, error: null, count: 4 });
    const client = createPostgrestClientMock({ from: builder });

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.countByStatus('waiting');

    expect(client.from).toHaveBeenCalledWith('holds');
    expect(builder.eq).toHaveBeenCalledWith('status', 'waiting');
    expect(result).toEqual({ count: 4, error: null });
  });

  it('cancels a hold by id', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: { ...holdRow, status: 'cancelled' }, error: null },
    });

    TestBed.configureTestingModule({
      providers: [HoldsRepository, { provide: SUPABASE_CLIENT, useValue: client }],
    });

    const repo = TestBed.inject(HoldsRepository);
    const result = await repo.cancelHold('h1');

    expect(client.rpc).toHaveBeenCalledWith('cancel_hold', { p_hold_id: 'h1' });
    expect(result).toEqual({ ok: true });
  });
});
