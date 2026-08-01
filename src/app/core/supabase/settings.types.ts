import type { TablesInsert, TablesUpdate } from './database.types';

type AssertTrue<T extends true> = T;

/**
 * Guards the `Omit`s below against a regenerated `database.types.ts` dropping
 * the excluded columns — same pattern as `ProfilesRoleIsGenerated`.
 */
export type MemberTypesIdentityIsGenerated = AssertTrue<
  'id' extends keyof TablesInsert<'member_types'> ? true : false
>;
export type AppSettingsIdentityIsGenerated = AssertTrue<
  'id' extends keyof TablesUpdate<'app_settings'> ? true : false
>;

/**
 * Client-safe settings writes. Identity/bookkeeping columns are excluded to
 * match the column-level GRANTs: `id`/`created_at` on member_types are
 * server-assigned, and on app_settings `id` is the constant singleton pk while
 * `updated_at` is trigger-maintained.
 */
export type MemberTypesClientInsert = Omit<TablesInsert<'member_types'>, 'id' | 'created_at'>;
export type MemberTypesClientUpdate = Omit<TablesUpdate<'member_types'>, 'id' | 'created_at'>;
export type AppSettingsClientUpdate = Omit<TablesUpdate<'app_settings'>, 'id' | 'updated_at'>;
