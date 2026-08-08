import { Service, inject } from '@angular/core';

import {
  createPostgrestAccess,
  pageToRange,
  toAccessResult,
  type ListQuery,
  type ListResult,
} from '../core/postgrest';
import { SUPABASE_CLIENT } from '../core/supabase';
import type { Hold, HoldListItem, HoldsError, HoldStatus, HoldStatusFilter } from './holds.types';
import { mapHoldsError } from './holds.types';

const HOLD_SELECT =
  '*, title:titles(title, author), member:members(name, card_barcode), copy:copies(barcode)';

@Service()
export class HoldsRepository {
  private readonly access = createPostgrestAccess(inject(SUPABASE_CLIENT));

  /** Oldest first: the queue is the story, and age makes stale rows visible. */
  async listHolds(
    status: HoldStatusFilter,
    query: ListQuery,
  ): Promise<ListResult<HoldListItem>> {
    const { from, to } = pageToRange(query.page, query.pageSize);

    let builder = this.access
      .from('holds')
      .select(HOLD_SELECT, { count: 'exact' })
      .order('created_at', { ascending: true })
      .range(from, to);

    if (status) {
      builder = builder.eq('status', status);
    }

    const result = toAccessResult(await builder);
    if (!result.ok) {
      return { rows: [], total: 0, error: result.error.message };
    }

    return {
      rows: (result.data as HoldListItem[] | null) ?? [],
      total: result.count ?? 0,
      error: null,
    };
  }

  /** Every hold for the member-detail page — queue positions plus history, oldest first. */
  async listByMember(memberId: string): Promise<{ rows: HoldListItem[]; error: string | null }> {
    const result = toAccessResult(
      await this.access
        .from('holds')
        .select(HOLD_SELECT)
        .eq('member_id', memberId)
        .order('created_at', { ascending: true }),
    );

    if (!result.ok) {
      return { rows: [], error: result.error.message };
    }

    return { rows: (result.data as HoldListItem[] | null) ?? [], error: null };
  }

  /** Queue order is enforced server-side: the RPC takes the title, never a hold id. */
  async markReady(
    titleId: string,
    copyBarcode: string,
  ): Promise<{ ok: true; hold: Hold } | { ok: false; error: HoldsError }> {
    const result = await this.access.rpc('mark_ready', {
      p_title_id: titleId,
      p_copy_barcode: copyBarcode.trim(),
    });

    if (!result.ok) {
      return { ok: false, error: mapHoldsError(result.error.message) };
    }
    if (!result.data) {
      return { ok: false, error: 'unexpected' };
    }
    return { ok: true, hold: result.data };
  }

  async cancelHold(
    holdId: string,
  ): Promise<{ ok: true } | { ok: false; error: HoldsError }> {
    const result = await this.access.rpc('cancel_hold', {
      p_hold_id: holdId,
    });

    if (!result.ok) {
      return { ok: false, error: mapHoldsError(result.error.message) };
    }
    return { ok: true };
  }

  /** Exact count for one status — the Overview "holds waiting" stat card. */
  async countByStatus(status: HoldStatus): Promise<{ count: number; error: string | null }> {
    const result = toAccessResult(
      await this.access
        .from('holds')
        .select('id', { count: 'exact', head: true })
        .eq('status', status),
    );

    if (!result.ok) {
      return { count: 0, error: result.error.message };
    }

    return { count: result.count ?? 0, error: null };
  }
}
