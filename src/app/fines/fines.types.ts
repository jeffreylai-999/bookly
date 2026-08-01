import type { Enums, Tables } from '../core/supabase';

export type Fine = Tables<'fines'>;
export type FineReason = Enums<'fine_reason'>;
export type FineStatus = Enums<'fine_status'>;

export type FineListItem = Fine & {
  member: { id: string; name: string; card_barcode: string } | null;
};

export type FineStatusFilter = FineStatus | 'all';

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
