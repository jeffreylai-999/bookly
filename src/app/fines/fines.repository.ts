import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../core/supabase';
import type {
  Fine,
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

  async getCurrency(): Promise<{ currency: string; error: string | null }> {
    const { data, error } = await this.supabase
      .from('app_settings')
      .select('currency')
      .eq('id', true)
      .single();

    return { currency: data?.currency ?? 'USD', error: error?.message ?? null };
  }

  /**
   * All-time desk totals. Fines and payments are small desk tables, so the
   * sums are computed client-side from two full reads rather than a view.
   */
  async summary(): Promise<{ row: FineSummary | null; error: string | null }> {
    const fines = await this.supabase.from('fines').select('amount, amount_paid, status');
    if (fines.error) {
      return { row: null, error: fines.error.message };
    }

    const payments = await this.supabase
      .from('payments')
      .select('amount')
      .is('voided_by', null);
    if (payments.error) {
      return { row: null, error: payments.error.message };
    }

    const rows = (fines.data as Pick<Fine, 'amount' | 'amount_paid' | 'status'>[] | null) ?? [];
    let outstandingBalance = 0;
    let waivedTotal = 0;
    for (const fine of rows) {
      const balance = fine.amount - fine.amount_paid;
      if (fine.status === 'waived') {
        waivedTotal += balance;
      } else if (fine.status === 'outstanding' || fine.status === 'partial') {
        outstandingBalance += balance;
      }
    }

    const collectedTotal = ((payments.data as Pick<Payment, 'amount'>[] | null) ?? []).reduce(
      (sum, payment) => sum + payment.amount,
      0,
    );

    return { row: { outstandingBalance, collectedTotal, waivedTotal }, error: null };
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
