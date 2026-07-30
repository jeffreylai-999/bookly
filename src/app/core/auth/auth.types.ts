import type { Session } from '@supabase/supabase-js';

import type { Tables } from '../supabase';

export type ProfileRole = Tables<'profiles'>['role'];
export type AuthProfile = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'email' | 'role' | 'locale'>;

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

export interface AuthStateSnapshot {
  session: Session | null;
  profile: AuthProfile | null;
  status: AuthStatus;
}
