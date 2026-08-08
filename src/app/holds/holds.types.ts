import { mapRpcError } from '../core/postgrest';
import type { Enums, Tables } from '../core/supabase';

export type HoldStatus = Enums<'hold_status'>;
export type Hold = Tables<'holds'>;

/** '' means every status — the filter's "all" option. */
export type HoldStatusFilter = '' | HoldStatus;

export type HoldListItem = Hold & {
  title: { title: string; author: string } | null;
  member: { name: string; card_barcode: string } | null;
  copy: { barcode: string } | null;
};

export type HoldsError =
  | 'not_authenticated'
  | 'profile_missing'
  | 'title_not_found'
  | 'copy_not_found'
  | 'copy_not_available'
  | 'no_waiting_holds'
  | 'hold_not_found'
  | 'hold_not_active'
  | 'load_failed'
  | 'unexpected';

export const HOLDS_ERROR_KEYS: Record<HoldsError, string> = {
  not_authenticated: 'holds.errors.notAuthenticated',
  profile_missing: 'holds.errors.profileMissing',
  title_not_found: 'holds.errors.titleNotFound',
  copy_not_found: 'holds.errors.copyNotFound',
  copy_not_available: 'holds.errors.copyNotAvailable',
  no_waiting_holds: 'holds.errors.noWaitingHolds',
  hold_not_found: 'holds.errors.holdNotFound',
  hold_not_active: 'holds.errors.holdNotActive',
  load_failed: 'holds.errors.loadFailed',
  unexpected: 'holds.errors.unexpected',
};

export function mapHoldsError(message: string | undefined): HoldsError {
  return mapRpcError(message, [
    'not_authenticated',
    'profile_missing',
    'title_not_found',
    'copy_not_available',
    'copy_not_found',
    'no_waiting_holds',
    'hold_not_active',
    'hold_not_found',
  ]);
}

export function holdStatusTone(status: HoldStatus): 'success' | 'info' | 'neutral' {
  switch (status) {
    case 'ready':
      return 'success';
    case 'waiting':
      return 'info';
    default:
      return 'neutral';
  }
}
