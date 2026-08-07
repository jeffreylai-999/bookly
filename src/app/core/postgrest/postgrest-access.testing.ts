import { vi, type Mock } from 'vitest';

import type { PostgrestClient } from './postgrest-access';

export type QueryBuilderMockResult = {
  data: unknown;
  error: { message: string; code?: string } | null;
  count?: number | null;
};

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

/**
 * Shared chainable PostgREST query-builder double for repository specs.
 * Methods are `vi.fn` spies that return `this`, and the builder is thenable.
 */
export function createQueryBuilderMock(result: QueryBuilderMockResult): QueryBuilderMock {
  const builder = {} as QueryBuilderMock;

  for (const method of QUERY_METHODS) {
    builder[method] = vi.fn().mockReturnValue(builder);
  }

  builder.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return builder;
}

export type PostgrestClientMockOptions = {
  fromBuilder?: QueryBuilderMock;
  rpcResult?: QueryBuilderMockResult;
};

/**
 * Minimal Supabase client double: `from` returns a query builder mock,
 * `rpc` resolves to a configured `{ data, error }` payload.
 */
export function createPostgrestClientMock(
  options: PostgrestClientMockOptions = {},
): PostgrestClient & { from: Mock; rpc: Mock } {
  const fromBuilder =
    options.fromBuilder ?? createQueryBuilderMock({ data: null, error: null });
  const rpcResult = options.rpcResult ?? { data: null, error: null };

  return {
    from: vi.fn().mockReturnValue(fromBuilder),
    rpc: vi.fn().mockResolvedValue(rpcResult),
  };
}
