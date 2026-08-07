import {
  createPostgrestAccess,
  mapPostgresCode,
  mapRpcError,
  pageToRange,
  toAccessResult,
} from './postgrest-access';
import { createPostgrestClientMock, createQueryBuilderMock } from './postgrest-access.testing';

describe('pageToRange', () => {
  it('converts 1-based page and pageSize to inclusive PostgREST range bounds', () => {
    expect(pageToRange(1, 10)).toEqual({ from: 0, to: 9 });
    expect(pageToRange(2, 10)).toEqual({ from: 10, to: 19 });
    expect(pageToRange(3, 25)).toEqual({ from: 50, to: 74 });
  });

  it('clamps page and pageSize to at least 1', () => {
    expect(pageToRange(0, 10)).toEqual({ from: 0, to: 9 });
    expect(pageToRange(-2, 10)).toEqual({ from: 0, to: 9 });
    expect(pageToRange(1, 0)).toEqual({ from: 0, to: 0 });
  });
});

describe('toAccessResult', () => {
  it('wraps successful PostgREST payloads as ok with data and count', () => {
    expect(
      toAccessResult({
        data: [{ id: '1' }],
        error: null,
        count: 12,
      }),
    ).toEqual({
      ok: true,
      data: [{ id: '1' }],
      count: 12,
    });
  });

  it('normalizes null data and missing count on success', () => {
    expect(toAccessResult({ data: null, error: null })).toEqual({
      ok: true,
      data: null,
      count: null,
    });
  });

  it('wraps PostgREST failures as ok:false with message and code', () => {
    expect(
      toAccessResult({
        data: null,
        error: { message: 'duplicate key', code: '23505' },
      }),
    ).toEqual({
      ok: false,
      error: { message: 'duplicate key', code: '23505' },
    });
  });

  it('defaults missing error code to null', () => {
    expect(
      toAccessResult({
        data: null,
        error: { message: 'boom' },
      }),
    ).toEqual({
      ok: false,
      error: { message: 'boom', code: null },
    });
  });
});

describe('mapRpcError', () => {
  it('returns the first listed code contained in the message', () => {
    expect(mapRpcError('ERROR: member_borrow_cap reached', ['member_not_found', 'member_borrow_cap'])).toBe(
      'member_borrow_cap',
    );
  });

  it('returns unexpected when message is missing or unmatched', () => {
    expect(mapRpcError(undefined, ['member_not_found'])).toBe('unexpected');
    expect(mapRpcError('something else', ['member_not_found'])).toBe('unexpected');
  });
});

describe('mapPostgresCode', () => {
  const CODES = { '23505': 'name_taken', '23503': 'member_type_in_use' } as const;

  it('maps known Postgres codes to domain errors', () => {
    expect(mapPostgresCode('23505', CODES, 'save_failed')).toBe('name_taken');
    expect(mapPostgresCode('23503', CODES, 'member_type_in_use')).toBe('member_type_in_use');
  });

  it('returns the fallback for unknown or missing codes', () => {
    expect(mapPostgresCode('42P01', CODES, 'save_failed')).toBe('save_failed');
    expect(mapPostgresCode(null, CODES, 'save_failed')).toBe('save_failed');
    expect(mapPostgresCode(undefined, CODES, 'save_failed')).toBe('save_failed');
  });
});

describe('createPostgrestAccess', () => {
  it('exposes rpc that returns the unified PostgrestAccessResult shape', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: [{ id: 'loan-1' }], error: null },
    });
    const access = createPostgrestAccess(client);

    await expect(
      access.rpc('checkout', { p_member_id: 'm1', p_copy_barcodes: ['c1'] }),
    ).resolves.toEqual({
      ok: true,
      data: [{ id: 'loan-1' }],
      count: null,
    });
    expect(client.rpc).toHaveBeenCalledWith('checkout', {
      p_member_id: 'm1',
      p_copy_barcodes: ['c1'],
    });
  });

  it('maps rpc transport errors through toAccessResult', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: null, error: { message: 'member_suspended', code: 'P0001' } },
    });
    const access = createPostgrestAccess(client);

    await expect(
      access.rpc('checkout', { p_member_id: 'm1', p_copy_barcodes: ['c1'] }),
    ).resolves.toEqual({
      ok: false,
      error: { message: 'member_suspended', code: 'P0001' },
    });
  });

  it('allows no-argument RPCs whose generated Args type is never', async () => {
    const client = createPostgrestClientMock({
      rpc: { data: [{ bucket: '1-7', bucket_order: 1, loan_count: 2 }], error: null },
    });
    const access = createPostgrestAccess(client);

    await expect(access.rpc('report_overdue_aging')).resolves.toEqual({
      ok: true,
      data: [{ bucket: '1-7', bucket_order: 1, loan_count: 2 }],
      count: null,
    });
    expect(client.rpc).toHaveBeenCalledWith('report_overdue_aging', undefined);
  });

  it('passes through from() for reads and offers no write path (ADR-0001)', () => {
    const builder = createQueryBuilderMock({ data: [], error: null, count: 0 });
    const client = createPostgrestClientMock({ from: builder });
    const access = createPostgrestAccess(client);

    expect(access.from('members')).toBe(builder);
    expect(client.from).toHaveBeenCalledWith('members');
    expect(Object.keys(access).sort()).toEqual(['from', 'rpc']);
  });
});

describe('createQueryBuilderMock', () => {
  it('is chainable and resolves to the configured PostgREST payload', async () => {
    const builder = createQueryBuilderMock({
      data: [{ id: '1' }],
      error: null,
      count: 1,
    });

    const result = await builder.select('*').eq('id', '1').range(0, 9);

    expect(builder.select).toHaveBeenCalledWith('*');
    expect(builder.eq).toHaveBeenCalledWith('id', '1');
    expect(builder.range).toHaveBeenCalledWith(0, 9);
    expect(result).toEqual({ data: [{ id: '1' }], error: null, count: 1 });
  });

  it('calls a payload resolver on every await, so one builder can serve several queries', async () => {
    const payloads = [
      { data: [{ id: 'a' }], error: null },
      { data: [{ id: 'b' }], error: null },
    ];
    const builder = createQueryBuilderMock(() => payloads.shift()!);

    expect(await builder.select('*')).toEqual({ data: [{ id: 'a' }], error: null });
    expect(await builder.select('*')).toEqual({ data: [{ id: 'b' }], error: null });
  });
});

describe('createPostgrestClientMock', () => {
  it('resolves from() per table so one client can serve a multi-table method', async () => {
    const fines = createQueryBuilderMock({ data: [{ amount: 5 }], error: null });
    const payments = createQueryBuilderMock({ data: [{ amount: 2 }], error: null });
    const client = createPostgrestClientMock({
      from: (table) => (table === 'fines' ? fines : payments),
    });

    expect(await client.from('fines').select('*')).toEqual({ data: [{ amount: 5 }], error: null });
    expect(await client.from('payments').select('*')).toEqual({
      data: [{ amount: 2 }],
      error: null,
    });
  });

  it('resolves rpc() per function name', async () => {
    const client = createPostgrestClientMock({
      rpc: (fn) => ({ data: fn, error: null }),
    });
    const access = createPostgrestAccess(client);

    await expect(access.rpc('cron_local_run_date', {
      p_last_run: '2026-01-01',
      p_now: '2026-01-02',
      p_timezone: 'UTC',
    })).resolves.toEqual({ ok: true, data: 'cron_local_run_date', count: null });
  });
});
