import type { AppSupabaseClient } from '../supabase';
import {
  createPostgrestAccess,
  mapPostgresCode,
  mapRpcError,
  pageToRange,
  toAccessResult,
  type PostgrestClient,
} from './postgrest-access';
import { createPostgrestClientMock, createQueryBuilderMock } from './postgrest-access.testing';

/** Compile-time: real Supabase client satisfies the access facade contract. */
const _appClientIsPostgrestClient = (client: AppSupabaseClient): PostgrestClient => client;
void _appClientIsPostgrestClient;

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
  it('maps known Postgres codes to domain errors', () => {
    expect(
      mapPostgresCode('23505', [
        { code: '23505', error: 'name_taken' },
        { code: '23503', error: 'member_type_in_use' },
      ], 'save_failed'),
    ).toBe('name_taken');

    expect(
      mapPostgresCode('23503', [
        { code: '23505', error: 'name_taken' },
        { code: '23503', error: 'member_type_in_use' },
      ], 'save_failed'),
    ).toBe('member_type_in_use');
  });

  it('returns the fallback for unknown or missing codes', () => {
    expect(mapPostgresCode('42P01', [{ code: '23505', error: 'name_taken' }], 'save_failed')).toBe(
      'save_failed',
    );
    expect(mapPostgresCode(null, [{ code: '23505', error: 'name_taken' }], 'save_failed')).toBe(
      'save_failed',
    );
  });
});

describe('createPostgrestAccess', () => {
  it('exposes rpc that returns the unified PostgrestAccessResult shape', async () => {
    const client = createPostgrestClientMock({
      rpcResult: { data: [{ id: 'loan-1' }], error: null },
    });
    const access = createPostgrestAccess(client);

    await expect(access.rpc('checkout', { p_member_id: 'm1' })).resolves.toEqual({
      ok: true,
      data: [{ id: 'loan-1' }],
      count: null,
    });
    expect(client.rpc).toHaveBeenCalledWith('checkout', { p_member_id: 'm1' });
  });

  it('maps rpc transport errors through toAccessResult', async () => {
    const client = createPostgrestClientMock({
      rpcResult: { data: null, error: { message: 'member_suspended', code: 'P0001' } },
    });
    const access = createPostgrestAccess(client);

    await expect(access.rpc('checkout')).resolves.toEqual({
      ok: false,
      error: { message: 'member_suspended', code: 'P0001' },
    });
  });

  it('passes through from() for reads without offering insert/update/delete helpers', () => {
    const builder = createQueryBuilderMock({ data: [], error: null, count: 0 });
    const client = createPostgrestClientMock({ fromBuilder: builder });
    const access = createPostgrestAccess(client);

    expect(access.from('members')).toBe(builder);
    expect(client.from).toHaveBeenCalledWith('members');
    expect(access).not.toHaveProperty('insert');
    expect(access).not.toHaveProperty('update');
    expect(access).not.toHaveProperty('delete');
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
});
