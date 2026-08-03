import { isPlatformBrowser } from '@angular/common';
import { DestroyRef, PLATFORM_ID, Service, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import type { RealtimeChannel } from '@supabase/supabase-js';

import { ToastService } from '../../ui';
import { SUPABASE_CLIENT } from '../supabase';
import { notificationMessage, type NotificationRow } from './notification.types';

/** Bounded at the query — no retention/pruning, matching audit_log (spec §5). */
const RECENT_LIMIT = 50;

/**
 * Feeds the shell's notification bell: initial load of the most recent rows
 * plus a separate unread count, Realtime inserts (toast + prepend), and
 * shared mark-read that persists across refreshes (spec §5 / this ticket).
 *
 * Realtime only runs in the browser — SSR has no socket to hold open, and the
 * initial render doesn't need it (the browser bootstrap loads fresh state).
 */
@Service()
export class NotificationService {
  private readonly supabase = inject(SUPABASE_CLIENT);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  private readonly notificationsState = signal<NotificationRow[]>([]);
  private readonly unreadCountState = signal(0);
  private readonly loadingState = signal(false);
  private readonly errorState = signal<string | null>(null);
  private readonly currencyState = signal('USD');

  readonly notifications = this.notificationsState.asReadonly();
  readonly unreadCount = this.unreadCountState.asReadonly();
  readonly loading = this.loadingState.asReadonly();
  readonly error = this.errorState.asReadonly();

  private channel: RealtimeChannel | null = null;
  private started = false;

  /** Idempotent — safe to call from every shell mount. */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await this.load();
    this.subscribe();
  }

  async reload(): Promise<void> {
    await this.load();
  }

  /** Shared read state: clears this row's unread state for every desk staff member. */
  async markRead(id: string): Promise<void> {
    const row = this.notificationsState().find((candidate) => candidate.id === id);
    if (!row || row.read_at) return;

    const readAt = new Date().toISOString();
    const { error } = await this.supabase
      .from('notifications')
      .update({ read_at: readAt })
      .eq('id', id)
      .is('read_at', null);
    if (error) return;

    this.notificationsState.update((rows) =>
      rows.map((candidate) =>
        candidate.id === id ? { ...candidate, read_at: readAt } : candidate,
      ),
    );
    this.unreadCountState.update((count) => Math.max(0, count - 1));
  }

  /** Shared read state: clears the badge for every desk staff member, not just this session. */
  async markAllRead(): Promise<void> {
    if (this.unreadCountState() === 0) return;
    const readAt = new Date().toISOString();
    const { error } = await this.supabase
      .from('notifications')
      .update({ read_at: readAt })
      .is('read_at', null);
    if (error) return;

    this.notificationsState.update((rows) =>
      rows.map((row) => (row.read_at ? row : { ...row, read_at: readAt })),
    );
    this.unreadCountState.set(0);
  }

  messageFor(row: NotificationRow) {
    return notificationMessage(row, {
      locale: this.transloco.getActiveLang(),
      currency: this.currencyState(),
    });
  }

  private async load(): Promise<void> {
    this.loadingState.set(true);
    this.errorState.set(null);
    try {
      const [list, count, settings] = await Promise.all([
        this.supabase
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(RECENT_LIMIT),
        this.supabase
          .from('notifications')
          .select('id', { count: 'exact', head: true })
          .is('read_at', null),
        this.supabase.from('app_settings').select('currency').eq('id', true).maybeSingle(),
      ]);

      if (list.error || count.error) {
        this.errorState.set('load_failed');
        return;
      }

      this.notificationsState.set(list.data ?? []);
      this.unreadCountState.set(count.count ?? 0);
      if (settings.data?.currency) {
        this.currencyState.set(settings.data.currency);
      }
    } catch {
      this.errorState.set('load_failed');
    } finally {
      this.loadingState.set(false);
    }
  }

  private subscribe(): void {
    if (!isPlatformBrowser(this.platformId) || this.channel) return;

    this.channel = this.supabase
      .channel('notifications-bell')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications' },
        (payload) => this.handleInsert(payload.new as NotificationRow),
      )
      .subscribe();

    this.destroyRef.onDestroy(() => {
      if (this.channel) {
        void this.supabase.removeChannel(this.channel);
        this.channel = null;
      }
    });
  }

  private handleInsert(row: NotificationRow): void {
    this.notificationsState.update((rows) => {
      if (rows.some((existing) => existing.id === row.id)) return rows;
      return [row, ...rows].slice(0, RECENT_LIMIT);
    });
    if (!row.read_at) {
      this.unreadCountState.update((count) => count + 1);
    }

    const message = this.messageFor(row);
    this.toast.show(this.transloco.translate(message.key, message.params));
  }
}
