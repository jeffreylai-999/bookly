import { vi, type Mock } from 'vitest';

import type { AppSupabaseClient } from '../supabase/client.types';

export type QueryBuilderMockResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

/** A fixed payload, or a resolver called each time the builder is awaited. */
export type QueryBuilderMockPayload =
  | QueryBuilderMockResult
  | (() => QueryBuilderMockResult | Promise<QueryBuilderMockResult>);

/**
 * Mirrors the raw client's query builder, writes included: `from` is a
 * pass-through, so staff-allowed non-flow writes still happen at call sites.
 * The facade itself exposes no write helper (ADR-0001).
 */
const QUERY_METHODS = [
  'select',
  'insert',
  'update',
  'delete',
  'upsert',
  'eq',
  'neq',
  'gt',
  'gte',
  'lt',
  'lte',
  'like',
  'ilike',
  'or',
  'in',
  'is',
  'order',
  'range',
  'limit',
  'single',
  'maybeSingle',
] as const;

export type QueryBuilderMock = {
  [K in (typeof QUERY_METHODS)[number]]: Mock;
} & {
  then: (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise<unknown>;
};

function resolvePayload(payload: QueryBuilderMockPayload) {
  return typeof payload === 'function' ? payload() : payload;
}

/**
 * Shared chainable PostgREST query-builder double for repository specs.
 * Methods are `vi.fn` spies that return `this`, and the builder is thenable.
 * Pass a resolver when one repository method queries several tables and each
 * await needs a different payload.
 */
export function createQueryBuilderMock(payload: QueryBuilderMockPayload): QueryBuilderMock {
  const builder = {} as QueryBuilderMock;

  for (const method of QUERY_METHODS) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  builder.then = (resolve, reject) => Promise.resolve(resolvePayload(payload)).then(resolve, reject);
  return builder;
}

export type PostgrestClientMockOptions = {
  /** One builder for every table, or a resolver keyed on the table name. */
  from?: QueryBuilderMock | ((table: string) => QueryBuilderMock);
  /** One payload for every function, or a resolver keyed on the function name. */
  rpc?:
    | QueryBuilderMockResult
    | ((fn: string, args?: unknown) => QueryBuilderMockResult | Promise<QueryBuilderMockResult>);
};

/**
 * Minimal Supabase client double: `from` returns a query builder mock,
 * `rpc` resolves to a configured `{ data, error }` payload. Cast to
 * `AppSupabaseClient` here so specs don't repeat it.
 */
export function createPostgrestClientMock(
  options: PostgrestClientMockOptions = {},
): AppSupabaseClient & { from: Mock; rpc: Mock } {
  const from = options.from ?? createQueryBuilderMock({ data: null, error: null });
  const rpc = options.rpc ?? { data: null, error: null };

  return {
    from: vi.fn((table: string) => (typeof from === 'function' ? from(table) : from)),
    rpc: vi.fn(async (fn: string, args?: unknown) =>
      typeof rpc === 'function' ? rpc(fn, args) : rpc,
    ),
  } as unknown as AppSupabaseClient & { from: Mock; rpc: Mock };
}
