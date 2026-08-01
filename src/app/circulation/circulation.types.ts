import type { Enums, Json, Tables } from '../core/supabase';
import type { FineReason, FineStatus } from '../fines/fines.types';

export type { FineReason, FineStatus } from '../fines/fines.types';

export type LoanStatus = Enums<'loan_status'>;
export type Loan = Tables<'loans'>;
export type CopyStatus = Enums<'copy_status'>;
export type MemberStatus = Enums<'member_status'>;
/** Row of the overdue_loans view — single source of the overdue formula (ADR-0002). */
export type OverdueLoan = Tables<'overdue_loans'>;

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

// ---------------------------------------------------------------------------
// Check-in
// ---------------------------------------------------------------------------

export type CheckinCondition = 'ok' | 'damaged' | 'lost';

export type CheckinError =
  | 'not_authenticated'
  | 'profile_missing'
  | 'copy_not_found'
  | 'loan_not_found'
  | 'invalid_condition'
  | 'damaged_amount_unexpected'
  | 'invalid_damaged_amount'
  | 'unexpected';

export const CHECKIN_ERROR_KEYS: Record<CheckinError, string> = {
  not_authenticated: 'circulation.checkin.errors.notAuthenticated',
  profile_missing: 'circulation.checkin.errors.profileMissing',
  copy_not_found: 'circulation.checkin.errors.copyNotFound',
  loan_not_found: 'circulation.checkin.errors.loanNotFound',
  invalid_condition: 'circulation.checkin.errors.invalidCondition',
  damaged_amount_unexpected: 'circulation.checkin.errors.damagedAmountUnexpected',
  invalid_damaged_amount: 'circulation.checkin.errors.invalidDamagedAmount',
  unexpected: 'circulation.checkin.errors.unexpected',
};

export function mapCheckinError(message: string | undefined): CheckinError {
  if (!message) return 'unexpected';
  const codes: CheckinError[] = [
    'not_authenticated',
    'profile_missing',
    'copy_not_found',
    'loan_not_found',
    'invalid_condition',
    'damaged_amount_unexpected',
    'invalid_damaged_amount',
  ];
  for (const code of codes) {
    if (message.includes(code)) return code;
  }
  return 'unexpected';
}

/** Active loan plus the copy and member behind it, resolved for check-in. */
export type CheckinLookup = {
  loan: Loan;
  copy: CheckoutCopy;
  member: { id: string; name: string; card_barcode: string };
};

/** Lookup plus the overdue view row when the loan is overdue. */
export type CheckinCandidate = CheckinLookup & {
  /** Present only when the loan is overdue; carries days_late + projected_fine. */
  projection: OverdueLoan | null;
};

export type CheckinFine = {
  id: string;
  member_id: string;
  loan_id: string | null;
  reason: FineReason;
  amount: number;
  status: FineStatus;
  accrual_rule_snapshot: Json;
  created_at: string;
};

export type CheckinSuccess = {
  ok: true;
  loan: Loan;
  copyStatus: CopyStatus;
  condition: CheckinCondition;
  daysLate: number | null;
  fines: CheckinFine[];
};

export type CheckinResult = CheckinSuccess | { ok: false; error: CheckinError };

/** Raw shape of the checkin RPC jsonb return. */
export type CheckinRpcPayload = {
  loan: Loan;
  copy_id: string;
  barcode: string;
  copy_status: CopyStatus;
  condition: CheckinCondition;
  days_late: number | null;
  fines: CheckinFine[];
};

// ---------------------------------------------------------------------------
// Monitoring tabs (active / overdue / returned)
// ---------------------------------------------------------------------------

export type LoansTab = 'active' | 'overdue' | 'returned';

export type LoanListItem = Loan & {
  copy: { id: string; barcode: string; title: string; author: string } | null;
  member: { id: string; name: string; card_barcode: string } | null;
};

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
