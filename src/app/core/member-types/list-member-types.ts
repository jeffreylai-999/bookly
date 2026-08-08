import { toAccessResult, type PostgrestAccess } from '../postgrest';
import type { Tables } from '../supabase';

export async function listMemberTypes(
  access: PostgrestAccess,
): Promise<{ rows: Tables<'member_types'>[]; error: string | null }> {
  const result = toAccessResult(
    await access.from('member_types').select('*').order('name', { ascending: true }),
  );
  if (!result.ok) {
    return { rows: [], error: result.error.message };
  }
  return { rows: result.data ?? [], error: null };
}
