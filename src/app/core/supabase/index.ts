export type { Database, Json, Tables, TablesInsert, TablesUpdate, Enums } from './database.types';
export { createSupabaseBrowserClient } from './browser-client';
export { createSupabaseServerClient } from './server-client';
export {
  SUPABASE_CLIENT,
  provideSupabaseClient,
  type AppSupabaseClient,
} from './supabase.providers';
