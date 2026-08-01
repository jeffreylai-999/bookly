import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../core/supabase';
import type {
  CheckoutCopy,
  CheckoutMember,
  CheckoutResult,
} from './circulation.types';
import { mapCheckoutError } from './circulation.types';

const MEMBER_SELECT =
  '*, member_type:member_types(id, name, loan_period_days, borrow_cap)';

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
}
