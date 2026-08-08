import { Service, inject } from '@angular/core';

import { listMemberTypes } from '../core/member-types';
import {
  createPostgrestAccess,
  pageToRange,
  toAccessResult,
} from '../core/postgrest';
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
  private readonly access = createPostgrestAccess(inject(SUPABASE_CLIENT));

  async list(query: MembersListQuery): Promise<MembersListResult & { error: string | null }> {
    const { from, to } = pageToRange(query.page, query.pageSize);

    let builder = this.access
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

    const result = toAccessResult(await builder);
    if (!result.ok) {
      return { rows: [], total: 0, error: result.error.message };
    }
    return {
      rows: (result.data ?? []) as MemberListItem[],
      total: result.count ?? 0,
      error: null,
    };
  }

  async getById(id: string): Promise<{ row: MemberListItem | null; error: string | null }> {
    const result = toAccessResult(
      await this.access.from('members').select(LIST_SELECT).eq('id', id).maybeSingle(),
    );
    if (!result.ok) {
      return { row: null, error: result.error.message };
    }
    return { row: (result.data as MemberListItem | null) ?? null, error: null };
  }

  async listMemberTypes(): Promise<{ rows: MemberType[]; error: string | null }> {
    return listMemberTypes(this.access);
  }

  async create(
    input: MembersClientInsert,
  ): Promise<{ row: MemberListItem | null; error: string | null }> {
    const result = toAccessResult(
      await this.access.from('members').insert(input).select(LIST_SELECT).single(),
    );
    if (!result.ok) {
      return { row: null, error: result.error.message };
    }
    return { row: (result.data as MemberListItem | null) ?? null, error: null };
  }

  async update(
    id: string,
    patch: MembersClientUpdate,
  ): Promise<{ row: MemberListItem | null; error: string | null }> {
    const result = toAccessResult(
      await this.access.from('members').update(patch).eq('id', id).select(LIST_SELECT).single(),
    );
    if (!result.ok) {
      return { row: null, error: result.error.message };
    }
    return { row: (result.data as MemberListItem | null) ?? null, error: null };
  }

  async setStatus(
    memberId: string,
    status: MemberStatus,
  ): Promise<{ row: Member | null; error: string | null }> {
    const result = await this.access.rpc('set_member_status', {
      p_member_id: memberId,
      p_status: status,
    });
    if (!result.ok) {
      return { row: null, error: result.error.message };
    }
    return { row: result.data ?? null, error: null };
  }
}
