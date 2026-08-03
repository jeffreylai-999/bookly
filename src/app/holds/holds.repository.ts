import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../core/supabase';
import type { Hold, HoldListItem, HoldsError, HoldStatusFilter } from './holds.types';
import { mapHoldsError } from './holds.types';

const HOLD_SELECT =
  '*, title:titles(title, author), member:members(name, card_barcode), copy:copies(barcode)';

export type ListQuery = { page: number; pageSize: number };
export type ListResult<T> = { rows: T[]; total: number; error: string | null };

type HoldJoinRow = Hold & {
  title: { title: string; author: string } | null;
  member: { name: string; card_barcode: string } | null;
  copy: { barcode: string } | null;
};

@Service()
export class HoldsRepository {
  private readonly supabase = inject(SUPABASE_CLIENT);

  /** Oldest first: the queue is the story, and age makes stale rows visible. */
  async listHolds(
    status: HoldStatusFilter,
    query: ListQuery,
  ): Promise<ListResult<HoldListItem>> {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let builder = this.supabase
      .from('holds')
      .select(HOLD_SELECT, { count: 'exact' })
      .order('created_at', { ascending: true })
      .range(from, to);

    if (status) {
      builder = builder.eq('status', status);
    }

    const { data, error, count } = await builder;
    return {
      rows: (data as HoldJoinRow[] | null) ?? [],
      total: count ?? 0,
      error: error?.message ?? null,
    };
  }

  /** Every hold for the member-detail page — queue positions plus history, oldest first. */
  async listByMember(memberId: string): Promise<{ rows: HoldListItem[]; error: string | null }> {
    const { data, error } = await this.supabase
      .from('holds')
      .select(HOLD_SELECT)
      .eq('member_id', memberId)
      .order('created_at', { ascending: true });

    return { rows: (data as HoldJoinRow[] | null) ?? [], error: error?.message ?? null };
  }

  /** Queue order is enforced server-side: the RPC takes the title, never a hold id. */
  async markReady(
    titleId: string,
    copyBarcode: string,
  ): Promise<{ ok: true; hold: Hold } | { ok: false; error: HoldsError }> {
    const { data, error } = await this.supabase.rpc('mark_ready', {
      p_title_id: titleId,
      p_copy_barcode: copyBarcode.trim(),
    });

    if (error || !data) {
      return { ok: false, error: mapHoldsError(error?.message) };
    }
    return { ok: true, hold: data };
  }

  async cancelHold(
    holdId: string,
  ): Promise<{ ok: true } | { ok: false; error: HoldsError }> {
    const { error } = await this.supabase.rpc('cancel_hold', {
      p_hold_id: holdId,
    });

    if (error) {
      return { ok: false, error: mapHoldsError(error.message) };
    }
    return { ok: true };
  }
}
