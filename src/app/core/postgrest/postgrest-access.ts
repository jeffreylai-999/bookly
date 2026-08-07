/**
 * Minimal client surface the access facade needs (ADR-0001: rpc + from for reads).
 * Method syntax (not property) so `AppSupabaseClient` stays assignable under
 * `strictFunctionTypes` — call-site params are checked bivariantly for methods.
 */
export interface PostgrestClient {
  from(relation: string): unknown;
  rpc(
    fn: string,
    args?: Record<string, unknown>,
  ): PromiseLike<{
    data: unknown;
    error: { message: string; code?: string } | null;
  }>;
}

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
  mapping: ReadonlyArray<{ code: string; error: TError }>,
  fallback: TError,
): TError {
  if (!code) return fallback;
  for (const entry of mapping) {
    if (entry.code === code) return entry.error;
  }
  return fallback;
}

/**
 * Thin PostgREST access facade.
 *
 * - `from` is the client's typed query entry (reads; staff-allowed non-flow
 *   writes stay at the call site). This module offers no insert/update/delete helpers.
 * - Flow mutations must go through `rpc()` (ADR-0001).
 */
export function createPostgrestAccess<TClient extends PostgrestClient>(client: TClient) {
  return {
    from: client.from.bind(client) as TClient['from'],

    async rpc<T>(fn: string, args?: Record<string, unknown>): Promise<PostgrestAccessResult<T>> {
      const { data, error } = await client.rpc(fn, args);
      return toAccessResult({ data: data as T, error });
    },
  };
}

export type PostgrestAccess<TClient extends PostgrestClient = PostgrestClient> = {
  from: TClient['from'];
  rpc: <T>(fn: string, args?: Record<string, unknown>) => Promise<PostgrestAccessResult<T>>;
};
