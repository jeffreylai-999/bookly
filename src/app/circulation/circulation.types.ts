import type { Enums, Tables } from '../core/supabase';

export type LoanStatus = Enums<'loan_status'>;
export type Loan = Tables<'loans'>;
export type CopyStatus = Enums<'copy_status'>;
export type MemberStatus = Enums<'member_status'>;

export type CheckoutMember = Tables<'members'> & {
  member_type: Pick<
    Tables<'member_types'>,
    'id' | 'name' | 'loan_period_days' | 'borrow_cap'
  > | null;
};

export type CheckoutCopy = {
  id: string;
  barcode: string;
  status: CopyStatus;
  title_id: string;
  title: string;
  author: string;
};

export type CheckoutError =
  | 'not_authenticated'
  | 'profile_missing'
  | 'member_not_found'
  | 'member_suspended'
  | 'member_blocked'
  | 'member_fine_blocked'
  | 'member_borrow_cap'
  | 'copies_required'
  | 'copy_not_found'
  | 'copy_on_loan'
  | 'copy_on_hold_shelf'
  | 'copy_lost'
  | 'copy_damaged'
  | 'copy_retired'
  | 'duplicate_barcode'
  | 'unexpected';

export type CheckoutResult =
  | { ok: true; loans: Loan[] }
  | { ok: false; error: CheckoutError };

export const CHECKOUT_ERROR_KEYS: Record<CheckoutError, string> = {
  not_authenticated: 'circulation.errors.notAuthenticated',
  profile_missing: 'circulation.errors.profileMissing',
  member_not_found: 'circulation.errors.memberNotFound',
  member_suspended: 'circulation.errors.memberSuspended',
  member_blocked: 'circulation.errors.memberBlocked',
  member_fine_blocked: 'circulation.errors.memberFineBlocked',
  member_borrow_cap: 'circulation.errors.memberBorrowCap',
  copies_required: 'circulation.errors.copiesRequired',
  copy_not_found: 'circulation.errors.copyNotFound',
  copy_on_loan: 'circulation.errors.copyOnLoan',
  copy_on_hold_shelf: 'circulation.errors.copyOnHoldShelf',
  copy_lost: 'circulation.errors.copyLost',
  copy_damaged: 'circulation.errors.copyDamaged',
  copy_retired: 'circulation.errors.copyRetired',
  duplicate_barcode: 'circulation.errors.duplicateBarcode',
  unexpected: 'circulation.errors.unexpected',
};

export function mapCheckoutError(message: string | undefined): CheckoutError {
  if (!message) return 'unexpected';
  const codes: CheckoutError[] = [
    'not_authenticated',
    'profile_missing',
    'member_not_found',
    'member_suspended',
    'member_blocked',
    'member_fine_blocked',
    'member_borrow_cap',
    'copies_required',
    'copy_not_found',
    'copy_on_loan',
    'copy_on_hold_shelf',
    'copy_lost',
    'copy_damaged',
    'copy_retired',
    'duplicate_barcode',
  ];
  for (const code of codes) {
    if (message.includes(code)) return code;
  }
  return 'unexpected';
}

export function memberStatusTone(
  status: MemberStatus,
): 'success' | 'danger' | 'neutral' {
  switch (status) {
    case 'active':
      return 'success';
    case 'suspended':
    case 'blocked':
      return 'danger';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}
