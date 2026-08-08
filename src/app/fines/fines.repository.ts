import { Service, inject } from '@angular/core';

import {
  createPostgrestAccess,
  pageToRange,
  toAccessResult,
  type ListQuery,
  type ListResult,
} from '../core/postgrest';
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

@Service()
export class FinesRepository {
  private readonly access = createPostgrestAccess(inject(SUPABASE_CLIENT));

  async list(
    query: ListQuery & { status: FineStatusFilter },
  ): Promise<ListResult<FineListItem>> {
    const { from, to } = pageToRange(query.page, query.pageSize);

    let builder = this.access
      .from('fines')
      .select(LIST_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.status !== 'all') {
      builder = builder.eq('status', query.status);
    }

    const result = toAccessResult(await builder);
    if (!result.ok) {
      return { rows: [], total: 0, error: result.error.message };
    }

    return {
      rows: (result.data as FineListItem[] | null) ?? [],
      total: result.count ?? 0,
      error: null,
    };
  }

  /** Fine history for the member-detail page — newest first, no pagination. */
  async listByMember(memberId: string): Promise<{ rows: FineListItem[]; error: string | null }> {
    const result = toAccessResult(
      await this.access
        .from('fines')
        .select(LIST_SELECT)
        .eq('member_id', memberId)
        .order('created_at', { ascending: false }),
    );

    if (!result.ok) {
      return { rows: [], error: result.error.message };
    }

    return { rows: (result.data as FineListItem[] | null) ?? [], error: null };
  }

  /** All-time desk totals, aggregated in SQL by the fines_summary view. */
  async summary(): Promise<{ row: FineSummary | null; error: string | null }> {
    const result = toAccessResult(
      await this.access.from('fines_summary').select('*').single(),
    );
    if (!result.ok) {
      return { row: null, error: result.error.message };
    }

    const data = result.data;
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
    const result = toAccessResult(
      await this.access
        .from('payments')
        .select('*')
        .eq('fine_id', fineId)
        .order('created_at', { ascending: true }),
    );

    if (!result.ok) {
      return { rows: [], error: result.error.message };
    }

    return { rows: result.data ?? [], error: null };
  }

  async recordPayment(fineId: string, amount: number, method: string): Promise<PaymentResult> {
    const result = await this.access.rpc('record_payment', {
      p_fine_id: fineId,
      p_amount: amount,
      p_method: method,
    });

    if (!result.ok) {
      return { ok: false, error: mapPaymentError(result.error.message) };
    }

    const payload = result.data as FineActionPayload;
    return { ok: true, receipt: payload };
  }

  async waiveFine(fineId: string, reason: string): Promise<WaiveResult> {
    const result = await this.access.rpc('waive_fine', {
      p_fine_id: fineId,
      p_reason: reason,
    });

    if (!result.ok) {
      return { ok: false, error: mapWaiveError(result.error.message) };
    }

    return { ok: true, fine: result.data };
  }

  async voidPayment(paymentId: string, reason: string): Promise<VoidResult> {
    const result = await this.access.rpc('void_payment', {
      p_payment_id: paymentId,
      p_reason: reason,
    });

    if (!result.ok) {
      return { ok: false, error: mapVoidError(result.error.message) };
    }

    const payload = result.data as FineActionPayload;
    return { ok: true, payment: payload.payment, fine: payload.fine };
  }
}
