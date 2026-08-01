import type { Tables } from '../core/supabase';

export type AuditLogRow = Tables<'audit_log'>;

export type AuditActorRef = Pick<Tables<'profiles'>, 'id' | 'full_name' | 'email'>;

export type AuditListItem = AuditLogRow & {
  actor_profile: AuditActorRef | null;
};

export interface AuditListQuery {
  page: number;
  pageSize: number;
  actorId: string | 'all';
  action: string | 'all';
  entityType: string | 'all';
  /** Inclusive start date `YYYY-MM-DD`, or empty. */
  fromDate: string;
  /** Inclusive end date `YYYY-MM-DD`, or empty. */
  toDate: string;
}

export interface AuditListResult {
  rows: AuditListItem[];
  total: number;
}

/** Machine action codes known to the UI (localized in `audit.actionCodes.*`). */
export const AUDIT_ACTION_CODES = [
  'member.create',
  'member.update',
  'member.status',
  'title.create',
  'title.update',
  'copy.create',
  'copy.update',
  'copy.set_status',
  'loan.checkout',
  'loan.checkin',
  'loan.renew',
  'hold.place',
  'hold.cancel',
  'hold.mark_ready',
  'fine.waive',
  'payment.record',
  'payment.void',
] as const;

export type AuditActionCode = (typeof AUDIT_ACTION_CODES)[number];

export const AUDIT_ENTITY_TYPES = [
  'member',
  'title',
  'copy',
  'loan',
  'hold',
  'fine',
  'payment',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** Transloco key for a machine action code, e.g. `member.create` → `audit.actionCodes.member.create`. */
export function auditActionLabelKey(action: string): string {
  return `audit.actionCodes.${action}`;
}

/** Pretty-print audit detail JSON for the inspect dialog. */
export function formatAuditDetail(detail: unknown): string {
  try {
    return JSON.stringify(detail ?? {}, null, 2);
  } catch {
    return String(detail);
  }
}
