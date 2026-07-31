import type { TablesInsert, TablesUpdate } from './database.types';

type AssertTrue<T extends true> = T;

/** Ensures regenerated types still expose `status` so the Omit below stays meaningful. */
export type MembersStatusIsGenerated = AssertTrue<
  'status' extends keyof TablesUpdate<'members'> ? true : false
>;

/**
 * Client-safe member insert/update. `status` is excluded to match the
 * column-level GRANT — status changes go through `set_member_status` only.
 */
export type MembersClientInsert = Omit<TablesInsert<'members'>, 'status'>;
export type MembersClientUpdate = Omit<TablesUpdate<'members'>, 'status'>;
