import { Service, inject } from '@angular/core';

import {
  createPostgrestAccess,
  pageToRange,
  toAccessResult,
} from '../core/postgrest';
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
  private readonly access = createPostgrestAccess(inject(SUPABASE_CLIENT));

  async list(query: AuditListQuery): Promise<AuditListResult & { error: string | null }> {
    const { from, to } = pageToRange(query.page, query.pageSize);

    let builder = this.access
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

    const result = toAccessResult(await builder);
    if (!result.ok) {
      return { rows: [], total: 0, error: result.error.message };
    }
    return {
      rows: (result.data ?? []) as AuditListItem[],
      total: result.count ?? 0,
      error: null,
    };
  }

  /** Most recent N entries regardless of filters — the Overview activity feed. */
  async listRecent(limit: number): Promise<{ rows: AuditListItem[]; error: string | null }> {
    const result = toAccessResult(
      await this.access
        .from('audit_log')
        .select(LIST_SELECT)
        .order('created_at', { ascending: false })
        .limit(limit),
    );
    if (!result.ok) {
      return { rows: [], error: result.error.message };
    }
    return { rows: (result.data ?? []) as AuditListItem[], error: null };
  }

  async listActors(): Promise<{ rows: AuditActorRef[]; error: string | null }> {
    const result = toAccessResult(
      await this.access
        .from('profiles')
        .select('id, full_name, email')
        .order('full_name', { ascending: true }),
    );
    if (!result.ok) {
      return { rows: [], error: result.error.message };
    }
    return { rows: (result.data ?? []) as AuditActorRef[], error: null };
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
