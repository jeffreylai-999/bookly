import type { AppSupabaseClient } from '../supabase/client.types';
import type { Database } from '../supabase/database.types';

type Functions = Database['public']['Functions'];

/** Name of a database function exposed to PostgREST. */
export type RpcName = keyof Functions;

/** Transport-level PostgREST failure carried in PostgrestAccessResult. */
export interface PostgrestFailure {
  message: string;
  code: string | null;
}

export type PostgrestAccessResult<T> =
  | { ok: true; data: T; count: number | null }
  | { ok: false; error: PostgrestFailure };

/** 1-based page/pageSize → inclusive PostgREST `.range(from, to)` bounds. */
export function pageToRange(page: number, pageSize: number): { from: number; to: number } {
  const safePage = Math.max(1, page);
  const safeSize = Math.max(1, pageSize);
  const from = (safePage - 1) * safeSize;
  const to = from + safeSize - 1;
  return { from, to };
}

/** Normalize a PostgREST `{ data, error, count? }` payload to PostgrestAccessResult. */
export function toAccessResult<T>(result: {
  data: T;
  error: { message: string; code?: string } | null;
  count?: number | null;
}): PostgrestAccessResult<T> {
  if (result.error) {
    return {
      ok: false,
      error: {
        message: result.error.message,
        code: result.error.code ?? null,
      },
    };
  }

  return {
    ok: true,
    data: result.data,
    count: result.count ?? null,
  };
}

/**
 * Map an RPC error message to a domain code by substring match.
 * Shared replacement for the hand-unrolled mappers in circulation/holds/fines.
 */
export function mapRpcError<TError extends string>(
  message: string | undefined,
  codes: readonly TError[],
): TError | 'unexpected' {
  if (!message) return 'unexpected';
  for (const code of codes) {
    if (message.includes(code)) return code;
  }
  return 'unexpected';
}

/** Map a Postgres/PostgREST error code to a domain error via an explicit table. */
export function mapPostgresCode<TError extends string>(
  code: string | null | undefined,
  mapping: Readonly<Record<string, TError>>,
  fallback: TError,
): TError {
  return (code ? mapping[code] : undefined) ?? fallback;
}

/**
 * Shape of `AppSupabaseClient.rpc` erased to a single callable. The generated
 * overloads can't be applied to an unresolved `TFn`, so the facade narrows once
 * here and keeps the typed signature on its own `rpc` below.
 */
type RpcInvoke = (
  fn: string,
  args?: unknown,
) => PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>;

/**
 * Thin PostgREST access facade.
 *
 * - `from` is the client's typed query entry (reads; staff-allowed non-flow
 *   writes stay at the call site). This module offers no insert/update/delete helpers.
 * - Flow mutations must go through `rpc()` (ADR-0001), whose function names,
 *   argument names and return payloads stay checked against `database.types`.
 */
export function createPostgrestAccess(client: AppSupabaseClient) {
  const invokeRpc = client.rpc.bind(client) as RpcInvoke;

  return {
    from: client.from.bind(client) as AppSupabaseClient['from'],

    async rpc<TFn extends RpcName>(
      fn: TFn,
      ...args: Functions[TFn]['Args'] extends never ? [] : [Functions[TFn]['Args']]
    ): Promise<PostgrestAccessResult<Functions[TFn]['Returns']>> {
      const { data, error } = await invokeRpc(fn, args[0]);
      return toAccessResult({ data: data as Functions[TFn]['Returns'], error });
    },
  };
}

export type PostgrestAccess = ReturnType<typeof createPostgrestAccess>;
