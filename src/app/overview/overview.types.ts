import type { AuditEntityType } from '../audit/audit.types';
import type { BadgeTone } from '../ui';

export const HOLDS_READY_LIMIT = 5;
export const DUE_TODAY_LIMIT = 5;
export const TOP_OVERDUE_LIMIT = 5;
export const RECENT_ACTIVITY_LIMIT = 8;

const ACTIVITY_ICON_BY_ENTITY: Partial<Record<AuditEntityType, string>> = {
  member: 'user',
  title: 'book-open',
  copy: 'book-open',
  loan: 'repeat',
  hold: 'hand',
  fine: 'banknote',
  payment: 'banknote',
  member_type: 'settings',
  app_settings: 'settings',
};

/** Recent-activity chip icon by entity type; unknown types fall back to a clock. */
export function activityIcon(entityType: string): string {
  return ACTIVITY_ICON_BY_ENTITY[entityType as AuditEntityType] ?? 'clock';
}

const ACTIVITY_TONE_BY_ACTION: Record<string, BadgeTone> = {
  'loan.checkin': 'success',
  'loan.checkout': 'info',
  'loan.renew': 'neutral',
  'hold.place': 'info',
  'hold.mark_ready': 'success',
  'hold.cancel': 'neutral',
  'hold.expire': 'neutral',
  'fine.waive': 'warning',
  'payment.record': 'success',
  'payment.void': 'danger',
  'member.status': 'warning',
};

/** Recent-activity chip tone by machine action code; unlisted actions read as neutral. */
export function activityTone(action: string): BadgeTone {
  return ACTIVITY_TONE_BY_ACTION[action] ?? 'neutral';
}
