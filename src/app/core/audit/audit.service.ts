import { Service, inject } from '@angular/core';

import { SUPABASE_CLIENT, type Json } from '../supabase';

/** Client-allowlisted audit actions (mirrors `log_audit` SQL allowlist). */
export type ClientAuditAction =
  | 'member.create'
  | 'member.update'
  | 'title.create'
  | 'title.update'
  | 'copy.create'
  | 'copy.update';

export interface AuditLogInput {
  action: ClientAuditAction;
  entityType: string;
  entityId: string;
  detail?: Json;
}

/**
 * Read-side helper for the audit viewer later; write path for simple single-table
 * edits. Actor is never a parameter — `log_audit` derives it from `auth.uid()`.
 */
@Service()
export class AuditService {
  private readonly supabase = inject(SUPABASE_CLIENT);

  async log(input: AuditLogInput): Promise<{ error: string | null }> {
    const { error } = await this.supabase.rpc('log_audit', {
      p_action: input.action,
      p_entity_type: input.entityType,
      p_entity_id: input.entityId,
      p_detail: input.detail ?? {},
    });
    return { error: error?.message ?? null };
  }
}
