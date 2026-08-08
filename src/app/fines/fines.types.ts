import { mapRpcError } from '../core/postgrest';
import type { Enums, Json, Tables } from '../core/supabase';

export type Fine = Tables<'fines'>;
export type FineReason = Enums<'fine_reason'>;
export type FineStatus = Enums<'fine_status'>;
export type Payment = Tables<'payments'>;

/** The loan + copy a fine was born from (null for loan-less fines). */
export type FineOrigin = {
  id: string;
  due_at: string;
  returned_at: string | null;
  copy: {
    id: string;
    barcode: string;
    titles: { title: string; author: string } | null;
  } | null;
};

export type FineListItem = Fine & {
  member: { id: string; name: string; card_barcode: string } | null;
  loan: FineOrigin | null;
};

export type FineStatusFilter = FineStatus | 'all';

/** Desk-level money totals behind the three summary stat cards. */
export type FineSummary = {
  /** sum(amount − amount_paid) over outstanding/partial fines — what's owed. */
  outstandingBalance: number;
  /** sum of non-voided payments — money actually taken. */
  collectedTotal: number;
  /** sum(amount − amount_paid) over waived fines — balance forgiven. */
  waivedTotal: number;
};

export const PAYMENT_METHODS = ['cash', 'card', 'other'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Remaining balance; waived fines are excluded from checkout gating upstream. */
export function fineBalance(fine: Pick<Fine, 'amount' | 'amount_paid'>): number {
  return fine.amount - fine.amount_paid;
}

export function fineReasonTone(reason: FineReason): 'warning' | 'danger' {
  switch (reason) {
    case 'overdue':
      return 'warning';
    case 'damaged':
    case 'lost':
      return 'danger';
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

export function fineStatusTone(status: FineStatus): 'success' | 'warning' | 'neutral' {
  switch (status) {
    case 'paid':
      return 'success';
    case 'outstanding':
      return 'warning';
    case 'partial':
    case 'waived':
      return 'neutral';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

/**
 * Renders the snapshotted accrual rule so staff can explain the charge.
 * Returns a translation key + params (amounts pre-formatted by the caller).
 */
export function fineAccrualLine(
  reason: FineReason,
  snapshot: Json,
  formatCurrency: (value: number) => string,
): { key: string; params?: Record<string, unknown> } | null {
  const data = snapshot as Record<string, Json | undefined> | null;
  switch (reason) {
    case 'overdue': {
      const days = data?.['days_late'];
      const rate = data?.['fine_rate_per_day'];
      if (typeof days !== 'number' || typeof rate !== 'number') return null;
      return { key: 'fines.accrual.overdue', params: { days, rate: formatCurrency(rate) } };
    }
    case 'damaged': {
      if (data?.['overridden'] === true) {
        const feeDefault = data?.['damaged_fee_default'];
        return {
          key: 'fines.accrual.damagedOverride',
          params: {
            feeDefault: typeof feeDefault === 'number' ? formatCurrency(feeDefault) : '',
          },
        };
      }
      return { key: 'fines.accrual.damagedDefault' };
    }
    case 'lost': {
      return {
        key:
          data?.['basis'] === 'replacement_cost'
            ? 'fines.accrual.lostReplacement'
            : 'fines.accrual.lostDefault',
      };
    }
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

// ---------------------------------------------------------------------------
// Payment / waive / void actions
// ---------------------------------------------------------------------------

/** RPC payload shared by record_payment and void_payment (jsonb returns). */
export type FineActionPayload = {
  payment: Payment;
  fine: Fine;
};

export type FineReceipt = FineActionPayload;

export type PaymentError =
  | 'not_authenticated'
  | 'profile_missing'
  | 'fine_not_found'
  | 'invalid_payment_amount'
  | 'payment_method_required'
  | 'fine_already_paid'
  | 'fine_waived'
  | 'payment_exceeds_balance'
  | 'unexpected';

export type WaiveError =
  | 'not_authenticated'
  | 'profile_missing'
  | 'admin_required'
  | 'waive_reason_required'
  | 'fine_not_found'
  | 'fine_already_paid'
  | 'fine_already_waived'
  | 'unexpected';

export type VoidError =
  | 'not_authenticated'
  | 'profile_missing'
  | 'admin_required'
  | 'void_reason_required'
  | 'payment_not_found'
  | 'payment_already_voided'
  | 'fine_waived'
  | 'unexpected';

export const PAYMENT_ERROR_KEYS: Record<PaymentError, string> = {
  not_authenticated: 'fines.errors.notAuthenticated',
  profile_missing: 'fines.errors.profileMissing',
  fine_not_found: 'fines.errors.fineNotFound',
  invalid_payment_amount: 'fines.errors.invalidPaymentAmount',
  payment_method_required: 'fines.errors.paymentMethodRequired',
  fine_already_paid: 'fines.errors.fineAlreadyPaid',
  fine_waived: 'fines.errors.fineWaived',
  payment_exceeds_balance: 'fines.errors.paymentExceedsBalance',
  unexpected: 'fines.errors.unexpected',
};

export const WAIVE_ERROR_KEYS: Record<WaiveError, string> = {
  not_authenticated: 'fines.errors.notAuthenticated',
  profile_missing: 'fines.errors.profileMissing',
  admin_required: 'fines.errors.adminRequired',
  waive_reason_required: 'fines.errors.waiveReasonRequired',
  fine_not_found: 'fines.errors.fineNotFound',
  fine_already_paid: 'fines.errors.fineAlreadyPaid',
  fine_already_waived: 'fines.errors.fineAlreadyWaived',
  unexpected: 'fines.errors.unexpected',
};

export const VOID_ERROR_KEYS: Record<VoidError, string> = {
  not_authenticated: 'fines.errors.notAuthenticated',
  profile_missing: 'fines.errors.profileMissing',
  admin_required: 'fines.errors.adminRequired',
  void_reason_required: 'fines.errors.voidReasonRequired',
  payment_not_found: 'fines.errors.paymentNotFound',
  payment_already_voided: 'fines.errors.paymentAlreadyVoided',
  fine_waived: 'fines.errors.fineWaived',
  unexpected: 'fines.errors.unexpected',
};

export type PaymentResult =
  | { ok: true; receipt: FineReceipt }
  | { ok: false; error: PaymentError };

export type WaiveResult = { ok: true; fine: Fine } | { ok: false; error: WaiveError };

export type VoidResult =
  | { ok: true; payment: Payment; fine: Fine }
  | { ok: false; error: VoidError };

export function mapPaymentError(message: string | undefined): PaymentError {
  return mapRpcError(message, [
    'not_authenticated',
    'profile_missing',
    'fine_not_found',
    'invalid_payment_amount',
    'payment_method_required',
    'fine_already_paid',
    'fine_waived',
    'payment_exceeds_balance',
  ]);
}

export function mapWaiveError(message: string | undefined): WaiveError {
  return mapRpcError(message, [
    'not_authenticated',
    'profile_missing',
    'admin_required',
    'waive_reason_required',
    'fine_not_found',
    'fine_already_paid',
    'fine_already_waived',
  ]);
}

export function mapVoidError(message: string | undefined): VoidError {
  return mapRpcError(message, [
    'not_authenticated',
    'profile_missing',
    'admin_required',
    'void_reason_required',
    'payment_not_found',
    'payment_already_voided',
    'fine_waived',
  ]);
}
