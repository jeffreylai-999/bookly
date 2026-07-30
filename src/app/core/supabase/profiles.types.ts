import type { TablesUpdate } from './database.types';

/**
 * Client-safe profile patch. `role` is excluded to match the column-level
 * GRANT (immutable from the JWT). Keep this outside `database.types.ts` —
 * `pnpm supabase:types` overwrites that file.
 */
export type ProfilesClientUpdate = Omit<TablesUpdate<'profiles'>, 'role'>;
