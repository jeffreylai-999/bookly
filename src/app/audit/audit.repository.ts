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
      // Local calendar day — matches <input type="date"> and DatePipe display.
      builder = builder.gte('created_at', localDayStartIso(query.fromDate.trim()));
    }
    if (query.toDate.trim()) {
      builder = builder.lt('created_at', localDayEndExclusiveIso(query.toDate.trim()));
    }

    const { data, error, count } = await builder;
    return {
      rows: (data as AuditListItem[] | null) ?? [],
      total: count ?? 0,
      error: error?.message ?? null,
    };
  }

  /** Most recent N entries regardless of filters — the Overview activity feed. */
  async listRecent(limit: number): Promise<{ rows: AuditListItem[]; error: string | null }> {
    const { data, error } = await this.supabase
      .from('audit_log')
      .select(LIST_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit);

    return { rows: (data as AuditListItem[] | null) ?? [], error: error?.message ?? null };
  }

  async listActors(): Promise<{ rows: AuditActorRef[]; error: string | null }> {
    const { data, error } = await this.supabase
      .from('profiles')
      .select('id, full_name, email')
      .order('full_name', { ascending: true });
    return { rows: (data as AuditActorRef[] | null) ?? [], error: error?.message ?? null };
  }
}

/** Inclusive local `YYYY-MM-DD` → ISO instant at local midnight. */
export function localDayStartIso(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString();
}

/** Inclusive local `YYYY-MM-DD` → ISO instant at local midnight of the next day. */
export function localDayEndExclusiveIso(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  return new Date(year, month - 1, day + 1, 0, 0, 0, 0).toISOString();
}
