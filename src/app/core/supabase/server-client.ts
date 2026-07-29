import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr';
import { REQUEST, RESPONSE_INIT, inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import type { AppSupabaseClient } from './client.types';
import type { Database } from './database.types';

/**
 * Per-request server client for Angular SSR. Reads session cookies from the
 * incoming Request and writes refreshes onto RESPONSE_INIT headers.
 */
export function createSupabaseServerClient(): AppSupabaseClient {
  const request = inject(REQUEST, { optional: true });
  const responseInit = inject(RESPONSE_INIT, { optional: true });

  return createServerClient<Database>(environment.supabase.url, environment.supabase.anonKey, {
    cookies: {
      getAll() {
        return parseCookieHeader(request?.headers?.get('Cookie') ?? '');
      },
      setAll(cookiesToSet, extraHeaders) {
        if (!responseInit) {
          return;
        }
        const headers = new Headers(responseInit.headers ?? {});
        for (const { name, value, options } of cookiesToSet) {
          headers.append('Set-Cookie', serializeCookieHeader(name, value, options));
        }
        // `@supabase/ssr` passes no-store cache directives alongside the
        // cookies. Dropping them lets a CDN cache a response carrying one
        // user's session token and serve it to somebody else.
        for (const [name, value] of Object.entries(extraHeaders ?? {})) {
          headers.set(name, value);
        }
        responseInit.headers = headers;
      },
    },
  });
}
