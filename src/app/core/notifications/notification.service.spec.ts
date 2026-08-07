import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';

import { ToastService } from '../../ui';
import { AppSettingsService } from '../app-settings';
import { SUPABASE_CLIENT } from '../supabase';
import { NotificationService } from './notification.service';
import type { NotificationRow } from './notification.types';

function holdReadyRow(overrides: Partial<NotificationRow> = {}): NotificationRow {
  return {
    id: 'n1',
    type: 'hold_ready',
    entity_type: 'hold',
    entity_id: 'h1',
    detail: { title: 'Dune', member_name: 'Ada Lovelace', expires_at: '2026-08-10T00:00:00Z' },
    read_at: null,
    created_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function makeThenable<T>(result: T) {
  return { then: (resolve: (value: T) => unknown) => Promise.resolve(result).then(resolve) };
}

function makeListBuilder(result: {
  data: NotificationRow[] | null;
  error: { message: string } | null;
}) {
  const builder: Record<string, unknown> = {};
  builder['order'] = vi.fn().mockReturnValue(builder);
  builder['limit'] = vi.fn().mockReturnValue(builder);
  builder['then'] = makeThenable(result).then;
  return builder;
}

function makeCountBuilder(result: { count: number | null; error: { message: string } | null }) {
  const builder: Record<string, unknown> = {};
  builder['is'] = vi.fn().mockReturnValue(builder);
  builder['then'] = makeThenable(result).then;
  return builder;
}

function makeUpdateBuilder(result: { error: { message: string } | null } = { error: null }) {
  const builder: Record<string, unknown> = {};
  builder['eq'] = vi.fn().mockReturnValue(builder);
  builder['is'] = vi.fn().mockReturnValue(builder);
  builder['then'] = makeThenable(result).then;
  return builder;
}

function setup(opts?: {
  list?: { data: NotificationRow[] | null; error: { message: string } | null };
  count?: { count: number | null; error: { message: string } | null };
  currency?: string;
}) {
  const listBuilder = makeListBuilder(opts?.list ?? { data: [holdReadyRow()], error: null });
  const countBuilder = makeCountBuilder(opts?.count ?? { count: 1, error: null });
  const updateBuilder = makeUpdateBuilder();

  const notificationsSelect = vi.fn((_columns: string, options?: { head?: boolean }) =>
    options?.head ? countBuilder : listBuilder,
  );
  const notificationsUpdate = vi.fn().mockReturnValue(updateBuilder);

  const from = vi.fn((table: string) => {
    expect(table).toBe('notifications');
    return { select: notificationsSelect, update: notificationsUpdate };
  });

  const channelObj: Record<string, unknown> = {};
  let insertCallback: ((payload: { new: NotificationRow }) => void) | null = null;
  channelObj['on'] = vi.fn((_type: string, _filter: unknown, callback: typeof insertCallback) => {
    insertCallback = callback;
    return channelObj;
  });
  channelObj['subscribe'] = vi.fn().mockReturnValue(channelObj);
  const channel = vi.fn().mockReturnValue(channelObj);
  const removeChannel = vi.fn();

  const toastShow = vi.fn();
  const translate = vi.fn((key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${JSON.stringify(params)}` : key,
  );
  const appSettings = {
    currency: () => opts?.currency ?? 'USD',
    load: vi.fn().mockResolvedValue(undefined),
  };

  TestBed.configureTestingModule({
    providers: [
      NotificationService,
      { provide: SUPABASE_CLIENT, useValue: { from, channel, removeChannel } },
      { provide: AppSettingsService, useValue: appSettings },
      { provide: ToastService, useValue: { show: toastShow, error: vi.fn() } },
      { provide: TranslocoService, useValue: { translate, getActiveLang: () => 'en-US' } },
    ],
  });

  return {
    service: TestBed.inject(NotificationService),
    from,
    notificationsSelect,
    notificationsUpdate,
    listBuilder,
    countBuilder,
    updateBuilder,
    channel,
    removeChannel,
    toastShow,
    translate,
    appSettings,
    emitInsert: (row: NotificationRow) => insertCallback?.({ new: row }),
  };
}

describe('NotificationService', () => {
  it('loads the recent list, unread count, and currency on init', async () => {
    const rows = [holdReadyRow(), holdReadyRow({ id: 'n2' })];
    const { service, appSettings } = setup({
      list: { data: rows, error: null },
      count: { count: 2, error: null },
      currency: 'EUR',
    });

    await service.init();

    expect(service.notifications()).toEqual(rows);
    expect(service.unreadCount()).toBe(2);
    expect(service.loading()).toBe(false);
    expect(service.error()).toBeNull();
    expect(appSettings.load).toHaveBeenCalled();
  });

  it('is idempotent — a second init does not reload', async () => {
    const { service, from } = setup();

    await service.init();
    const callsAfterFirst = from.mock.calls.length;
    await service.init();

    expect(from.mock.calls.length).toBe(callsAfterFirst);
  });

  it('surfaces a load error without throwing', async () => {
    const { service } = setup({ list: { data: null, error: { message: 'boom' } } });

    await service.init();

    expect(service.error()).toBe('load_failed');
    expect(service.notifications()).toEqual([]);
  });

  it('markAllRead updates every unread row and clears the badge (shared, no owner filter)', async () => {
    const rows = [holdReadyRow({ id: 'n1' }), holdReadyRow({ id: 'n2' })];
    const { service, notificationsUpdate, updateBuilder } = setup({
      list: { data: rows, error: null },
      count: { count: 2, error: null },
    });
    await service.init();

    await service.markAllRead();

    expect(notificationsUpdate).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(updateBuilder['is']).toHaveBeenCalledWith('read_at', null);
    expect(service.unreadCount()).toBe(0);
    expect(service.notifications().every((row) => row.read_at !== null)).toBe(true);
  });

  it('markAllRead is a no-op when nothing is unread', async () => {
    const { service, notificationsUpdate } = setup({ count: { count: 0, error: null } });
    await service.init();

    await service.markAllRead();

    expect(notificationsUpdate).not.toHaveBeenCalled();
  });

  it('markRead updates a single row and decrements the unread count', async () => {
    const rows = [holdReadyRow({ id: 'n1' }), holdReadyRow({ id: 'n2' })];
    const { service, notificationsUpdate, updateBuilder } = setup({
      list: { data: rows, error: null },
      count: { count: 2, error: null },
    });
    await service.init();

    await service.markRead('n1');

    expect(notificationsUpdate).toHaveBeenCalledWith({ read_at: expect.any(String) });
    expect(updateBuilder['eq']).toHaveBeenCalledWith('id', 'n1');
    expect(updateBuilder['is']).toHaveBeenCalledWith('read_at', null);
    expect(service.unreadCount()).toBe(1);
    expect(service.notifications().find((row) => row.id === 'n1')?.read_at).not.toBeNull();
    expect(service.notifications().find((row) => row.id === 'n2')?.read_at).toBeNull();
  });

  it('markRead on an already-read row is a no-op', async () => {
    const rows = [holdReadyRow({ id: 'n1', read_at: '2026-08-01T00:00:00Z' })];
    const { service, notificationsUpdate } = setup({
      list: { data: rows, error: null },
      count: { count: 0, error: null },
    });
    await service.init();

    await service.markRead('n1');

    expect(notificationsUpdate).not.toHaveBeenCalled();
  });

  it('subscribes to Realtime inserts on init and prepends, badges, and toasts new rows', async () => {
    const { service, channel, emitInsert, toastShow } = setup({
      list: { data: [], error: null },
      count: { count: 0, error: null },
    });
    await service.init();

    expect(channel).toHaveBeenCalledWith('notifications-bell');

    const incoming = holdReadyRow({ id: 'n-new' });
    emitInsert(incoming);

    expect(service.notifications()[0]).toEqual(incoming);
    expect(service.unreadCount()).toBe(1);
    expect(toastShow).toHaveBeenCalledWith(
      expect.stringContaining('notifications.messages.holdReady'),
    );
  });

  it('does not double-count a Realtime row that is already read', async () => {
    const { service, emitInsert } = setup({
      list: { data: [], error: null },
      count: { count: 0, error: null },
    });
    await service.init();

    emitInsert(holdReadyRow({ id: 'n-read', read_at: '2026-08-02T00:00:00Z' }));

    expect(service.unreadCount()).toBe(0);
  });

  it('formats messageFor with the loaded currency', async () => {
    const { service } = setup({
      list: { data: [], error: null },
      count: { count: 0, error: null },
      currency: 'EUR',
    });
    await service.init();

    const message = service.messageFor(
      holdReadyRow({ type: 'payment_recorded', detail: { amount: 5, member_name: 'Ada' } }),
    );

    expect(message.params['amount']).toContain('€');
  });
});
