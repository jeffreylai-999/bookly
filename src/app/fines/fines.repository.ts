import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../core/supabase';
import type { FineListItem, FineStatusFilter } from './fines.types';

const LIST_SELECT = '*, member:members(id, name, card_barcode)';

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
}
