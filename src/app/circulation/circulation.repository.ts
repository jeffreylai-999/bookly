import { Service, inject } from '@angular/core';

import {
  createPostgrestAccess,
  pageToRange,
  toAccessResult,
} from '../core/postgrest';
import { SUPABASE_CLIENT, type Tables } from '../core/supabase';
import type {
  CheckinCondition,
  CheckinLookup,
  CheckinResult,
  CheckinRpcPayload,
  CheckoutCopy,
  CheckoutMember,
  CheckoutResult,
  CheckoutTrendPoint,
  DueTodayLoan,
  Loan,
  LoanListItem,
  OverdueLoan,
  RenewResult,
} from './circulation.types';
import { mapCheckinError, mapCheckoutError, mapRenewError } from './circulation.types';

const MEMBER_SELECT =
  '*, member_type:member_types(id, name, loan_period_days, borrow_cap)';

const LOAN_SELECT =
  '*, copy:copies!inner(id, barcode, status, title_id, titles(title, author)), member:members!inner(id, name, card_barcode)';

const LOAN_LIST_SELECT =
  '*, copy:copies(id, barcode, titles(title, author)), member:members(id, name, card_barcode)';

/**
 * The member-panel money line: balance from materialized fines only (the same
 * sum the checkout gate enforces), projected from the overdue_loans view —
 * provisional, never blocking (spec §6).
 */
export type MemberMoney = { balance: number; projected: number };

export type ListQuery = { page: number; pageSize: number };
export type ListResult<T> = { rows: T[]; total: number; error: string | null };

type LoanJoinRow = Tables<'loans'> & {
  copy: {
    id: string;
    barcode: string;
    status: Tables<'copies'>['status'];
    title_id: string;
    titles: { title: string; author: string } | null;
  } | null;
  member: { id: string; name: string; card_barcode: string } | null;
};

function flattenLoan(row: LoanJoinRow): LoanListItem {
  const { copy, member, ...loan } = row;
  return {
    ...loan,
    copy: copy
      ? {
          id: copy.id,
          barcode: copy.barcode,
          title: copy.titles?.title ?? '',
          author: copy.titles?.author ?? '',
        }
      : null,
    member: member ?? null,
  };
}

@Service()
export class CirculationRepository {
  private readonly access = createPostgrestAccess(inject(SUPABASE_CLIENT));

  async findMemberByCard(
    cardBarcode: string,
  ): Promise<{ row: CheckoutMember | null; error: string | null }> {
    const barcode = cardBarcode.trim();
    const result = toAccessResult(
      await this.access
        .from('members')
        .select(MEMBER_SELECT)
        .eq('card_barcode', barcode)
        .maybeSingle(),
    );

    if (!result.ok) {
      return { row: null, error: result.error.message };
    }
    return {
      row: (result.data as CheckoutMember | null) ?? null,
      error: null,
    };
  }

  async searchMembers(
    query: string,
  ): Promise<{ rows: CheckoutMember[]; error: string | null }> {
    const search = query.trim();
    let builder = this.access
      .from('members')
      .select(MEMBER_SELECT)
      .order('name', { ascending: true })
      .limit(8);

    if (search) {
      const pattern = `"%${search.replace(/"/g, '')}%"`;
      builder = builder.or(`name.ilike.${pattern},card_barcode.ilike.${pattern}`);
    }

    const result = toAccessResult(await builder);
    if (!result.ok) {
      return { rows: [], error: result.error.message };
    }
    return {
      rows: (result.data as CheckoutMember[] | null) ?? [],
      error: null,
    };
  }

  async findCopyByBarcode(
    barcode: string,
  ): Promise<{ row: CheckoutCopy | null; error: string | null }> {
    const code = barcode.trim();
    const result = toAccessResult(
      await this.access
        .from('copies')
        .select('id, barcode, status, title_id, titles(title, author)')
        .eq('barcode', code)
        .maybeSingle(),
    );

    if (!result.ok) {
      return { row: null, error: result.error.message };
    }
    if (!result.data) {
      return { row: null, error: null };
    }

    const titles = result.data.titles as { title: string; author: string } | null;
    return {
      row: {
        id: result.data.id,
        barcode: result.data.barcode,
        status: result.data.status,
        title_id: result.data.title_id,
        title: titles?.title ?? '',
        author: titles?.author ?? '',
      },
      error: null,
    };
  }

  async checkout(memberId: string, barcodes: string[]): Promise<CheckoutResult> {
    const result = await this.access.rpc('checkout', {
      p_member_id: memberId,
      p_copy_barcodes: barcodes,
    });

    if (!result.ok) {
      return { ok: false, error: mapCheckoutError(result.error.message) };
    }

    return { ok: true, loans: result.data ?? [] };
  }

  async findActiveLoanByBarcode(
    barcode: string,
  ): Promise<{ row: CheckinLookup | null; error: string | null }> {
    const code = barcode.trim();
    const result = toAccessResult(
      await this.access
        .from('loans')
        .select(LOAN_SELECT)
        .eq('status', 'active')
        .eq('copy.barcode', code)
        .maybeSingle(),
    );

    if (!result.ok) return { row: null, error: result.error.message };
    if (!result.data) return { row: null, error: null };

    const row = result.data as LoanJoinRow;
    if (!row.copy || !row.member) return { row: null, error: null };

    const { copy, member, ...loan } = row;
    return {
      row: {
        loan,
        copy: {
          id: copy.id,
          barcode: copy.barcode,
          status: copy.status,
          title_id: copy.title_id,
          title: copy.titles?.title ?? '',
          author: copy.titles?.author ?? '',
        },
        member,
      },
      error: null,
    };
  }

  async getOverdueProjection(
    loanId: string,
  ): Promise<{ row: OverdueLoan | null; error: string | null }> {
    const result = toAccessResult(
      await this.access.from('overdue_loans').select('*').eq('loan_id', loanId).maybeSingle(),
    );

    if (!result.ok) {
      return { row: null, error: result.error.message };
    }
    return { row: result.data ?? null, error: null };
  }

  async getMemberMoney(
    memberId: string,
  ): Promise<{ row: MemberMoney | null; error: string | null }> {
    const fines = toAccessResult(
      await this.access
        .from('fines')
        .select('amount, amount_paid')
        .eq('member_id', memberId)
        .in('status', ['outstanding', 'partial']),
    );
    if (!fines.ok) {
      return { row: null, error: fines.error.message };
    }

    const overdue = toAccessResult(
      await this.access
        .from('overdue_loans')
        .select('projected_fine')
        .eq('member_id', memberId),
    );
    if (!overdue.ok) {
      return { row: null, error: overdue.error.message };
    }

    const balance = (fines.data ?? []).reduce(
      (sum, fine) => sum + (fine.amount - fine.amount_paid),
      0,
    );
    const projected = (overdue.data ?? []).reduce(
      (sum, loan) => sum + (loan.projected_fine ?? 0),
      0,
    );

    return { row: { balance, projected }, error: null };
  }

  async countWaitingHolds(
    titleId: string,
  ): Promise<{ count: number; error: string | null }> {
    const result = toAccessResult(
      await this.access
        .from('holds')
        .select('id', { count: 'exact', head: true })
        .eq('title_id', titleId)
        .eq('status', 'waiting'),
    );

    if (!result.ok) {
      return { count: 0, error: result.error.message };
    }
    return { count: result.count ?? 0, error: null };
  }

  async checkin(
    barcode: string,
    condition: CheckinCondition,
    damagedAmount?: number,
    fillHold = false,
  ): Promise<CheckinResult> {
    const result = await this.access.rpc('checkin', {
      p_copy_barcode: barcode.trim(),
      p_condition: condition,
      ...(damagedAmount === undefined ? {} : { p_damaged_amount: damagedAmount }),
      ...(fillHold ? { p_fill_hold: true } : {}),
    });

    if (!result.ok) {
      return { ok: false, error: mapCheckinError(result.error.message) };
    }

    const payload = result.data as CheckinRpcPayload;
    return {
      ok: true,
      loan: payload.loan,
      copyStatus: payload.copy_status,
      condition: payload.condition,
      daysLate: payload.days_late,
      fines: payload.fines ?? [],
      hold: payload.hold ?? null,
    };
  }

  async renew(loanId: string): Promise<RenewResult> {
    const result = await this.access.rpc('renew_loan', {
      p_loan_id: loanId,
    });

    if (!result.ok) {
      return { ok: false, error: mapRenewError(result.error.message) };
    }

    return { ok: true, loan: result.data as Loan };
  }

  /** Current loans for the member-detail page — no pagination, the borrow cap keeps this small. */
  async listActiveLoansByMember(
    memberId: string,
  ): Promise<{ rows: LoanListItem[]; error: string | null }> {
    const result = toAccessResult(
      await this.access
        .from('loans')
        .select(LOAN_LIST_SELECT)
        .eq('member_id', memberId)
        .eq('status', 'active')
        .order('due_at', { ascending: true }),
    );

    if (!result.ok) {
      return { rows: [], error: result.error.message };
    }
    return {
      rows: ((result.data as LoanJoinRow[] | null) ?? []).map(flattenLoan),
      error: null,
    };
  }

  async listLoans(
    status: 'active' | 'returned',
    query: ListQuery,
  ): Promise<ListResult<LoanListItem>> {
    const { from, to } = pageToRange(query.page, query.pageSize);
    const active = status === 'active';

    const result = toAccessResult(
      await this.access
        .from('loans')
        .select(LOAN_LIST_SELECT, { count: 'exact' })
        .eq('status', status)
        .order(active ? 'due_at' : 'returned_at', { ascending: active })
        .range(from, to),
    );

    if (!result.ok) {
      return { rows: [], total: 0, error: result.error.message };
    }
    return {
      rows: ((result.data as LoanJoinRow[] | null) ?? []).map(flattenLoan),
      total: result.count ?? 0,
      error: null,
    };
  }

  async listOverdue(query: ListQuery): Promise<ListResult<OverdueLoan>> {
    const { from, to } = pageToRange(query.page, query.pageSize);

    const result = toAccessResult(
      await this.access
        .from('overdue_loans')
        .select('*', { count: 'exact' })
        .order('days_late', { ascending: false })
        .order('due_at', { ascending: true })
        .range(from, to),
    );

    if (!result.ok) {
      return { rows: [], total: 0, error: result.error.message };
    }
    return {
      rows: result.data ?? [],
      total: result.count ?? 0,
      error: null,
    };
  }

  /** Due today, library-local (due_today_loans view) — feeds the Overview launchpad. */
  async listDueToday(query: ListQuery): Promise<ListResult<DueTodayLoan>> {
    const { from, to } = pageToRange(query.page, query.pageSize);

    const result = toAccessResult(
      await this.access
        .from('due_today_loans')
        .select('*', { count: 'exact' })
        .order('due_at', { ascending: true })
        .range(from, to),
    );

    if (!result.ok) {
      return { rows: [], total: 0, error: result.error.message };
    }
    return {
      rows: result.data ?? [],
      total: result.count ?? 0,
      error: null,
    };
  }

  /** 14-day, zero-filled, library-local checkout counts (checkout_trend view). */
  async getCheckoutTrend(): Promise<{ rows: CheckoutTrendPoint[]; error: string | null }> {
    const result = toAccessResult(
      await this.access.from('checkout_trend').select('*').order('day', { ascending: true }),
    );

    if (!result.ok) {
      return { rows: [], error: result.error.message };
    }
    return { rows: result.data ?? [], error: null };
  }
}
