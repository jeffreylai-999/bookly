import { Service, inject } from '@angular/core';

import {
  SUPABASE_CLIENT,
  type MembersClientInsert,
  type MembersClientUpdate,
} from '../core/supabase';
import type {
  Member,
  MemberListItem,
  MemberStatus,
  MemberType,
  MembersListQuery,
  MembersListResult,
} from './members.types';

const LIST_SELECT = '*, member_type:member_types(id, name)';

@Service()
export class MembersRepository {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async list(query: MembersListQuery): Promise<MembersListResult & { error: string | null }> {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let builder = this.supabase
      .from('members')
      .select(LIST_SELECT, { count: 'exact' })
      .order('name', { ascending: true })
      .range(from, to);

    const search = query.nameSearch.trim();
    if (search) {
      builder = builder.ilike('name', `%${search}%`);
    }
    if (query.status !== 'all') {
      builder = builder.eq('status', query.status);
    }

    const { data, error, count } = await builder;
    return {
      rows: (data as MemberListItem[] | null) ?? [],
      total: count ?? 0,
      error: error?.message ?? null,
    };
  }

  async getById(id: string): Promise<{ row: MemberListItem | null; error: string | null }> {
    const { data, error } = await this.supabase
      .from('members')
      .select(LIST_SELECT)
      .eq('id', id)
      .maybeSingle();
    return { row: (data as MemberListItem | null) ?? null, error: error?.message ?? null };
  }

  async listMemberTypes(): Promise<{ rows: MemberType[]; error: string | null }> {
    const { data, error } = await this.supabase
      .from('member_types')
      .select('*')
      .order('name', { ascending: true });
    return { rows: data ?? [], error: error?.message ?? null };
  }

  async create(
    input: MembersClientInsert,
  ): Promise<{ row: MemberListItem | null; error: string | null }> {
    const { data, error } = await this.supabase
      .from('members')
      .insert(input)
      .select(LIST_SELECT)
      .single();
    return { row: (data as MemberListItem | null) ?? null, error: error?.message ?? null };
  }

  async update(
    id: string,
    patch: MembersClientUpdate,
  ): Promise<{ row: MemberListItem | null; error: string | null }> {
    const { data, error } = await this.supabase
      .from('members')
      .update(patch)
      .eq('id', id)
      .select(LIST_SELECT)
      .single();
    return { row: (data as MemberListItem | null) ?? null, error: error?.message ?? null };
  }

  async setStatus(
    memberId: string,
    status: MemberStatus,
  ): Promise<{ row: Member | null; error: string | null }> {
    const { data, error } = await this.supabase.rpc('set_member_status', {
      p_member_id: memberId,
      p_status: status,
    });
    return { row: data ?? null, error: error?.message ?? null };
  }
}
