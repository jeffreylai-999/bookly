import { createBrowserClient } from '@supabase/ssr';

import { environment } from '../../../environments/environment';
import type { AppSupabaseClient } from './client.types';
import type { Database } from './database.types';

/** Cookie-backed browser client (singleton inside `@supabase/ssr`). */
export function createSupabaseBrowserClient(): AppSupabaseClient {
  return createBrowserClient<Database>(environment.supabase.url, environment.supabase.anonKey);
}
