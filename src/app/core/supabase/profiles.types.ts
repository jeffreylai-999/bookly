import type { TablesUpdate } from './database.types';

/**
 * `AssertTrue<false>` violates its own constraint, so the instantiation below
 * fails the build rather than compiling to nothing.
 */
type AssertTrue<T extends true> = T;

/**
 * Guards the `Omit` below. `Omit<T, K>` compiles fine when `K` is absent from
 * `T`, so if a regenerated `database.types.ts` ever stops carrying `role`,
 * `ProfilesClientUpdate` would silently become a no-op alias for the full
 * update type. This assertion turns that into a compile error instead.
 */
export type ProfilesRoleIsGenerated = AssertTrue<
  'role' extends keyof TablesUpdate<'profiles'> ? true : false
>;

/**
 * Client-safe profile patch. `role` is excluded to match the column-level
 * GRANT that keeps it immutable from a user JWT. Keep this outside
 * `database.types.ts` — `pnpm supabase:types` overwrites that file wholesale.
 *
 * Type the update call site with this, not raw `TablesUpdate<'profiles'>`:
 * the exclusion only protects code that actually uses it.
 */
export type ProfilesClientUpdate = Omit<TablesUpdate<'profiles'>, 'role'>;
