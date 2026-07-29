import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
} from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { REQUEST, RESPONSE_INIT, inject } from '@angular/core';

import { environment } from '../../../environments/environment';
import type { Database } from './database.types';

/**
 * Per-request server client for Angular SSR. Reads session cookies from the
 * incoming Request and writes refreshes onto RESPONSE_INIT headers.
 */
export function createSupabaseServerClient(): SupabaseClient<Database> {
  const request = inject(REQUEST, { optional: true });
  const responseInit = inject(RESPONSE_INIT, { optional: true });

  return createServerClient<Database>(
    environment.supabase.url,
    environment.supabase.anonKey,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request?.headers?.get('Cookie') ?? '');
        },
        setAll(cookiesToSet) {
          if (!responseInit) {
            return;
          }
          const headers = new Headers(responseInit.headers);
          for (const { name, value, options } of cookiesToSet) {
            headers.append('Set-Cookie', serializeCookieHeader(name, value, options));
          }
          responseInit.headers = headers;
        },
      },
    },
  );
}
