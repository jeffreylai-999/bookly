import { notificationIcon, notificationMessage, type NotificationRow } from './notification.types';

const FORMAT = { locale: 'en-US', currency: 'USD' };

function row(overrides: Partial<NotificationRow>): NotificationRow {
  return {
    id: 'n1',
    type: 'hold_ready',
    entity_type: 'hold',
    entity_id: 'h1',
    detail: {},
    read_at: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('notificationMessage', () => {
  it('maps hold_ready to a localized key with title/member/expiry params', () => {
    const message = notificationMessage(
      row({
        type: 'hold_ready',
        detail: {
          title: 'Dune',
          member_name: 'Ada Lovelace',
          expires_at: '2026-08-10T00:00:00Z',
        },
      }),
      FORMAT,
    );

    expect(message.key).toBe('notifications.messages.holdReady');
    expect(message.params['title']).toBe('Dune');
    expect(message.params['member']).toBe('Ada Lovelace');
    expect(message.params['expires']).toContain('2026');
  });

  it('maps payment_recorded to a localized key with a formatted amount', () => {
    const message = notificationMessage(
      row({
        type: 'payment_recorded',
        detail: { amount: 12.5, member_name: 'Ada Lovelace' },
      }),
      FORMAT,
    );

    expect(message.key).toBe('notifications.messages.paymentRecorded');
    expect(message.params['amount']).toContain('12.50');
    expect(message.params['member']).toBe('Ada Lovelace');
  });

  it('formats the amount in the given currency', () => {
    const message = notificationMessage(
      row({ type: 'payment_recorded', detail: { amount: 5, member_name: 'Ada' } }),
      { locale: 'en-US', currency: 'EUR' },
    );

    expect(message.params['amount']).toContain('€');
  });

  it('maps overdue to a localized key with title/member params', () => {
    const message = notificationMessage(
      row({ type: 'overdue', detail: { title: 'Dune', member_name: 'Ada Lovelace' } }),
      FORMAT,
    );

    expect(message.key).toBe('notifications.messages.overdue');
    expect(message.params).toEqual({ title: 'Dune', member: 'Ada Lovelace' });
  });

  it('falls back to a generic message for an unrecognized type', () => {
    const message = notificationMessage(row({ type: 'something_new' }), FORMAT);

    expect(message.key).toBe('notifications.messages.fallback');
    expect(message.params).toEqual({});
  });

  it('tolerates a detail shape missing its fields instead of throwing', () => {
    const message = notificationMessage(row({ type: 'hold_ready', detail: {} }), FORMAT);

    expect(message.key).toBe('notifications.messages.holdReady');
    expect(message.params).toEqual({ title: '', member: '', expires: '' });
  });
});

describe('notificationIcon', () => {
  it('maps each known type to an icon + tone', () => {
    expect(notificationIcon('hold_ready')).toEqual({ icon: 'check-circle-2', tone: 'success' });
    expect(notificationIcon('payment_recorded')).toEqual({ icon: 'banknote', tone: 'purple' });
    expect(notificationIcon('overdue')).toEqual({ icon: 'alert-circle', tone: 'warning' });
  });

  it('falls back to a neutral bell for an unrecognized type', () => {
    expect(notificationIcon('something_new')).toEqual({ icon: 'bell', tone: 'neutral' });
  });
});
