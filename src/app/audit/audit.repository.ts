import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT } from '../core/supabase';
import type {
  AuditActorRef,
  AuditListItem,
  AuditListQuery,
  AuditListResult,
} from './audit.types';

const LIST_SELECT = '*, actor_profile:profiles!audit_log_actor_fkey(id, full_name, email)';

@Service()
export class AuditRepository {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async list(query: AuditListQuery): Promise<AuditListResult & { error: string | null }> {
    const from = (query.page - 1) * query.pageSize;
    const to = from + query.pageSize - 1;

    let builder = this.supabase
      .from('audit_log')
      .select(LIST_SELECT, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(from, to);

    if (query.actorId !== 'all') {
      builder = builder.eq('actor', query.actorId);
    }
    if (query.action !== 'all') {
      builder = builder.eq('action', query.action);
    }
    if (query.entityType !== 'all') {
      builder = builder.eq('entity_type', query.entityType);
    }
    if (query.fromDate.trim()) {
      builder = builder.gte('created_at', `${query.fromDate.trim()}T00:00:00.000Z`);
    }
    if (query.toDate.trim()) {
      builder = builder.lt('created_at', exclusiveEndInstant(query.toDate.trim()));
    }

    const { data, error, count } = await builder;
    return {
      rows: (data as AuditListItem[] | null) ?? [],
      total: count ?? 0,
      error: error?.message ?? null,
    };
  }

  async listActors(): Promise<{ rows: AuditActorRef[]; error: string | null }> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name', { ascending: true });
    return { rows: (data as AuditActorRef[] | null) ?? [], error: error?.message ?? null };
  }
}

/** Inclusive `YYYY-MM-DD` → exclusive UTC midnight of the following calendar day. */
function exclusiveEndInstant(toDate: string): string {
  const [year, month, day] = toDate.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  const yyyy = next.getUTCFullYear();
  const mm = String(next.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(next.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}T00:00:00.000Z`;
}
