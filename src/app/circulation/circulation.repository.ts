import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT, type Tables } from '../core/supabase';
import type {
  CheckinCondition,
  CheckinLookup,
  CheckinResult,
  CheckinRpcPayload,
  CheckoutCopy,
  CheckoutMember,
  CheckoutResult,
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

export type DeskSettings = Pick<Tables<'app_settings'>, 'currency' | 'damaged_fee_default'>;

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
  private readonly supabase = inject(SUPABASE_CLIENT);

  async findMemberByCard(
    cardBarcode: string,
  ): Promise<{ row: CheckoutMember | null; error: string | null }> {
    const barcode = cardBarcode.trim();
    const { data, error } = await this.supabase
      .from('members')
      .select(MEMBER_SELECT)
      .eq('card_barcode', barcode)
      .maybeSingle();

    return {
      row: (data as CheckoutMember | null) ?? null,
      error: error?.message ?? null,
    };
  }

  async searchMembers(
    query: string,
  ): Promise<{ rows: CheckoutMember[]; error: string | null }> {
    const search = query.trim();
    let builder = this.supabase
      .from('members')
      .select(MEMBER_SELECT)
      .order('name', { ascending: true })
      .limit(8);

    if (search) {
      const pattern = `"%${search.replace(/"/g, '')}%"`;
      builder = builder.or(`name.ilike.${pattern},card_barcode.ilike.${pattern}`);
    }

    const { data, error } = await builder;
    return {
      rows: (data as CheckoutMember[] | null) ?? [],
      error: error?.message ?? null,
    };
  }

  async findCopyByBarcode(
    barcode: string,
  ): Promise<{ row: CheckoutCopy | null; error: string | null }> {
    const code = barcode.trim();
    const { data, error } = await this.supabase
      .from('copies')
      .select('id, barcode, status, title_id, titles(title, author)')
      .eq('barcode', code)
      .maybeSingle();

    if (error) {
      return { row: null, error: error.message };
    }
    if (!data) {
      return { row: null, error: null };
    }

    const titles = data.titles as { title: string; author: string } | null;
    return {
      row: {
        id: data.id,
        barcode: data.barcode,
        status: data.status,
        title_id: data.title_id,
        title: titles?.title ?? '',
        author: titles?.author ?? '',
      },
      error: null,
    };
  }

  async checkout(memberId: string, barcodes: string[]): Promise<CheckoutResult> {
    const { data, error } = await this.supabase.rpc('checkout', {
      p_member_id: memberId,
      p_copy_barcodes: barcodes,
    });

    if (error) {
      return { ok: false, error: mapCheckoutError(error.message) };
    }

    return { ok: true, loans: data ?? [] };
  }

  async findActiveLoanByBarcode(
    barcode: string,
  ): Promise<{ row: CheckinLookup | null; error: string | null }> {
    const code = barcode.trim();
    const { data, error } = await this.supabase
      .from('loans')
      .select(LOAN_SELECT)
      .eq('status', 'active')
      .eq('copy.barcode', code)
      .maybeSingle();

    if (error) return { row: null, error: error.message };
    if (!data) return { row: null, error: null };

    const row = data as LoanJoinRow;
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
    const { data, error } = await this.supabase
      .from('overdue_loans')
      .select('*')
      .eq('loan_id', loanId)
      .maybeSingle();

    return { row: data ?? null, error: error?.message ?? null };
  }

  async getSettings(): Promise<{ row: DeskSettings | null; error: string | null }> {
    const { data, error } = await this.supabase
      .from('app_settings')
      .select('currency, damaged_fee_default')
      .eq('id', true)
      .single();

    return { row: data ?? null, error: error?.message ?? null };
  }

  async checkin(
    barcode: string,
    condition: CheckinCondition,
    damagedAmount?: number,
  ): Promise<CheckinResult> {
    const { data, error } = await this.supabase.rpc('checkin', {
      p_copy_barcode: barcode.trim(),
      p_condition: condition,
      ...(damagedAmount === undefined ? {} : { p_damaged_amount: damagedAmount }),
    });

    if (error) {
      return { ok: false, error: mapCheckinError(error.message) };
    }

    const payload = data as CheckinRpcPayload;
    return {
      ok: true,
      loan: payload.loan,
      copyStatus: payload.copy_status,
      condition: payload.condition,
      daysLate: payload.days_late,
      fines: payload.fines ?? [],
    };
  }

  async renew(loanId: string): Promise<RenewResult> {
    const { data, error } = await this.supabase.rpc('renew_loan', {
      p_loan_id: loanId,
    });

    if (error) {
      return { ok: false, error: mapRenewError(error.message) };
    }

    return { ok: true, loan: data as Loan };
  }

  async listLoans(
    status: 'active' | 'returned',
    query: ListQuery,
  ): Promise<ListResult<LoanListItem>> {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;
    const active = status === 'active';

    const { data, error, count } = await this.supabase
      .from('loans')
      .select(LOAN_LIST_SELECT, { count: 'exact' })
      .eq('status', status)
      .order(active ? 'due_at' : 'returned_at', { ascending: active })
      .range(from, to);

    return {
      rows: ((data as LoanJoinRow[] | null) ?? []).map(flattenLoan),
      total: count ?? 0,
      error: error?.message ?? null,
    };
  }

  async listOverdue(query: ListQuery): Promise<ListResult<OverdueLoan>> {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    const { data, error, count } = await this.supabase
      .from('overdue_loans')
      .select('*', { count: 'exact' })
      .order('days_late', { ascending: false })
      .order('due_at', { ascending: true })
      .range(from, to);

    return {
      rows: data ?? [],
      total: count ?? 0,
      error: error?.message ?? null,
    };
  }
}
