import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from './database.types';

/**
 * The one spelling of "a Supabase client for this app's schema".
 *
 * Lives here rather than beside the providers so the client factories can name
 * it without importing from the module that imports them.
 */
export type AppSupabaseClient = SupabaseClient<Database>;
