import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../core/supabase';
import type {
  FineActionPayload,
  FineListItem,
  FineStatusFilter,
  FineSummary,
  Payment,
  PaymentResult,
  VoidResult,
  WaiveResult,
} from './fines.types';
import { mapPaymentError, mapVoidError, mapWaiveError } from './fines.types';

const LIST_SELECT =
  '*, member:members(id, name, card_barcode), ' +
  'loan:loans(id, due_at, returned_at, copy:copies(id, barcode, titles(title, author)))';

export type FinesListQuery = {
  page: number;
  pageSize: number;
  status: FineStatusFilter;
};

export type FinesListResult = {
  rows: FineListItem[];
  total: number;
  error: string | null;
};

@Service()
export class FinesRepository {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async list(query: FinesListQuery): Promise<FinesListResult> {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let builder = this.supabase
      .from('fines')
      .select(LIST_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.status !== 'all') {
      builder = builder.eq('status', query.status);
    }

    const { data, error, count } = await builder;
    return {
      rows: (data as FineListItem[] | null) ?? [],
      total: count ?? 0,
      error: error?.message ?? null,
    };
  }

  /** Fine history for the member-detail page — newest first, no pagination. */
  async listByMember(memberId: string): Promise<{ rows: FineListItem[]; error: string | null }> {
    const { data, error } = await this.supabase
      .from('fines')
      .select(LIST_SELECT)
      .eq('member_id', memberId)
      .order('created_at', { ascending: false });

    return { rows: (data as FineListItem[] | null) ?? [], error: error?.message ?? null };
  }

  /** All-time desk totals, aggregated in SQL by the fines_summary view. */
  async summary(): Promise<{ row: FineSummary | null; error: string | null }> {
    const { data, error } = await this.supabase.from('fines_summary').select('*').single();
    if (error) {
      return { row: null, error: error.message };
    }

    return {
      row: {
        outstandingBalance: data?.outstanding_balance ?? 0,
        collectedTotal: data?.collected_total ?? 0,
        waivedTotal: data?.waived_total ?? 0,
      },
      error: null,
    };
  }

  async listPayments(fineId: string): Promise<{ rows: Payment[]; error: string | null }> {
    const { data, error } = await this.supabase
      .from('payments')
      .select('*')
      .eq('fine_id', fineId)
      .order('created_at', { ascending: true });

    return { rows: data ?? [], error: error?.message ?? null };
  }

  async recordPayment(fineId: string, amount: number, method: string): Promise<PaymentResult> {
    const { data, error } = await this.supabase.rpc('record_payment', {
      p_fine_id: fineId,
      p_amount: amount,
      p_method: method,
    });

    if (error) {
      return { ok: false, error: mapPaymentError(error.message) };
    }

    const payload = data as FineActionPayload;
    return { ok: true, receipt: { payment: payload.payment, fine: payload.fine } };
  }

  async waiveFine(fineId: string, reason: string): Promise<WaiveResult> {
    const { data, error } = await this.supabase.rpc('waive_fine', {
      p_fine_id: fineId,
      p_reason: reason,
    });

    if (error) {
      return { ok: false, error: mapWaiveError(error.message) };
    }

    return { ok: true, fine: data };
  }

  async voidPayment(paymentId: string, reason: string): Promise<VoidResult> {
    const { data, error } = await this.supabase.rpc('void_payment', {
      p_payment_id: paymentId,
      p_reason: reason,
    });

    if (error) {
      return { ok: false, error: mapVoidError(error.message) };
    }

    const payload = data as FineActionPayload;
    return { ok: true, payment: payload.payment, fine: payload.fine };
  }
}
