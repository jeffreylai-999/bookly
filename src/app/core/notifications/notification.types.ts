import type { Tables } from '../supabase';

export type NotificationRow = Tables<'notifications'>;

/**
 * The three types the schema's check constraint allows (spec §4). Kept as a
 * plain string union for narrowing, not an exhaustive-switch target — `type`
 * is typed `string` at the DB boundary, and an unrecognized value (a future
 * type the client hasn't shipped copy for yet) must fall back gracefully
 * rather than throw.
 */
export type NotificationType = 'hold_ready' | 'overdue' | 'payment_recorded';

export interface NotificationMessage {
  key: string;
  params: Record<string, unknown>;
}

export interface NotificationFormat {
  locale: string;
  currency: string;
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function num(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function formatCurrency(value: number, format: NotificationFormat): string {
  return new Intl.NumberFormat(format.locale, {
    style: 'currency',
    currency: format.currency,
  }).format(value);
}

function formatDate(value: string, format: NotificationFormat): string {
  return new Intl.DateTimeFormat(format.locale, { dateStyle: 'medium' }).format(new Date(value));
}

/**
 * Server-generated notifications carry data, not text (spec §10 / ADR-0003):
 * this maps `type` + `detail` to a translation key + interpolation params so
 * every reader renders the bell in their own language. An unrecognized type
 * or a detail shape missing its fields falls back to a generic line instead
 * of surfacing raw ids.
 */
export function notificationMessage(
  row: NotificationRow,
  format: NotificationFormat,
): NotificationMessage {
  const detail = (row.detail ?? {}) as Record<string, unknown>;

  switch (row.type as NotificationType) {
    case 'hold_ready': {
      const expiresAt = str(detail['expires_at']);
      return {
        key: 'notifications.messages.holdReady',
        params: {
          title: str(detail['title']),
          member: str(detail['member_name']),
          expires: expiresAt ? formatDate(expiresAt, format) : '',
        },
      };
    }
    case 'payment_recorded': {
      const amount = num(detail['amount']);
      return {
        key: 'notifications.messages.paymentRecorded',
        params: {
          amount: amount !== null ? formatCurrency(amount, format) : '',
          member: str(detail['member_name']),
        },
      };
    }
    case 'overdue': {
      return {
        key: 'notifications.messages.overdue',
        params: {
          title: str(detail['title']),
          member: str(detail['member_name']),
        },
      };
    }
    default:
      return { key: 'notifications.messages.fallback', params: {} };
  }
}

/** Icon + tone per type, for the bell dropdown's leading chip. */
export function notificationIcon(type: string): {
  icon: string;
  tone: 'success' | 'purple' | 'warning' | 'neutral';
} {
  switch (type as NotificationType) {
    case 'hold_ready':
      return { icon: 'check-circle-2', tone: 'success' };
    case 'payment_recorded':
      return { icon: 'banknote', tone: 'purple' };
    case 'overdue':
      return { icon: 'alert-circle', tone: 'warning' };
    default:
      return { icon: 'bell', tone: 'neutral' };
  }
}
