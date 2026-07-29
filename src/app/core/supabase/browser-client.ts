import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

import { environment } from '../../../environments/environment';
import type { Database } from './database.types';

/** Cookie-backed browser client (singleton inside `@supabase/ssr`). */
export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(
    environment.supabase.url,
    environment.supabase.anonKey,
  );
}
