import { DatePipe } from '@angular/common';
import { Component, ElementRef, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule } from 'lucide-angular';

import { NotificationService, notificationIcon, type NotificationRow } from '../core/notifications';
import { UiEmptyState, UiListItem, UiSkeleton } from '../ui';

/**
 * Shell-wide bell: initial load + unread count come from `NotificationService`
 * on init; Realtime inserts (toast + badge) are handled there too, so this
 * component only renders what the service already holds (spec §5).
 */
@Component({
  selector: 'app-notification-bell',
  imports: [DatePipe, LucideAngularModule, TranslocoPipe, UiEmptyState, UiListItem, UiSkeleton],
  template: `
    <button
      type="button"
      class="relative flex size-9 items-center justify-center rounded-lg border border-transparent text-ink-soft transition-colors duration-100 hover:bg-control-hover focus-ring"
      aria-haspopup="true"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="bellLabel()"
      (click)="toggle()"
    >
      <lucide-angular name="bell" [size]="18" [strokeWidth]="1.75" />
      @if (unreadCount() > 0) {
        <span
          aria-hidden="true"
          class="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-pink px-1 text-[10px] font-bold leading-none text-white"
        >
          {{ badgeCount() }}
        </span>
      }
    </button>

    @if (open()) {
      <div
        role="region"
        [attr.aria-label]="'notifications.title' | transloco"
        class="absolute right-0 top-[calc(100%+8px)] z-40 w-[22rem] max-w-[90vw] overflow-hidden rounded-card border border-line bg-surface shadow-toast"
      >
        <div class="flex items-center justify-between gap-3 border-b border-divider px-4 py-3">
          <span class="text-[13px] font-bold text-ink-heading">
            {{ 'notifications.title' | transloco }}
          </span>
          <button
            type="button"
            class="text-xs font-semibold text-brand-dark transition-colors duration-100 hover:text-brand-strong disabled:cursor-default disabled:text-disabled disabled:hover:text-disabled"
            [disabled]="unreadCount() === 0"
            (click)="markAllRead()"
          >
            {{ 'notifications.markAllRead' | transloco }}
          </button>
        </div>

        <div class="max-h-[24rem] overflow-y-auto">
          @if (loading()) {
            <div class="px-4 py-4"><ui-skeleton [rows]="3" /></div>
          } @else if (error()) {
            <p role="alert" class="px-4 py-4 text-sm font-semibold text-danger">
              {{ 'notifications.loadFailed' | transloco }}
            </p>
          } @else if (rows().length === 0) {
            <ui-empty-state
              [headline]="'notifications.empty.headline' | transloco"
              [message]="'notifications.empty.message' | transloco"
            />
          } @else {
            <ul class="divide-y divide-divider">
              @for (row of rows(); track row.id) {
                <li>
                  <button
                    type="button"
                    class="w-full px-4 py-3 text-left transition-colors duration-100 hover:bg-control-hover focus-ring"
                    [class.bg-bg-canvas]="!row.read_at"
                    [attr.title]="messageText(row)"
                    (click)="onSelect(row)"
                  >
                    <ui-list-item
                      [icon]="iconName(row)"
                      [iconTone]="iconTone(row)"
                      [title]="messageText(row)"
                      [meta]="(row.created_at | date: 'short') ?? undefined"
                    >
                      @if (!row.read_at) {
                        <span
                          aria-hidden="true"
                          class="size-2 shrink-0 rounded-full bg-brand"
                        ></span>
                      }
                    </ui-list-item>
                  </button>
                </li>
              }
            </ul>
          }
        </div>
      </div>
    }
  `,
  host: {
    class: 'relative',
    '(document:click)': 'onDocumentClick($event)',
    '(document:keydown.escape)': 'onEscape()',
  },
})
export class NotificationBell implements OnInit {
  private readonly notifications = inject(NotificationService);
  private readonly transloco = inject(TranslocoService);
  private readonly elementRef = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly rows = this.notifications.notifications;
  protected readonly unreadCount = this.notifications.unreadCount;
  protected readonly loading = this.notifications.loading;
  protected readonly error = this.notifications.error;

  protected readonly badgeCount = computed(() => {
    const count = this.unreadCount();
    return count > 9 ? '9+' : String(count);
  });

  /**
   * `translate()` reads the active language off a plain BehaviorSubject
   * (`getActiveLang()`), not a signal, so it registers no dependency of its
   * own — reading `activeLang()` here is what makes this `computed` rerun
   * (and the aria-label re-render) on a language switch.
   */
  protected readonly bellLabel = computed(() => {
    const lang = this.transloco.activeLang();
    const count = this.unreadCount();
    return count > 0
      ? this.transloco.translate('notifications.bellLabelUnread', { count }, lang)
      : this.transloco.translate('notifications.bellLabel', undefined, lang);
  });

  ngOnInit(): void {
    void this.notifications.init();
  }

  protected toggle(): void {
    this.open.update((value) => !value);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (!this.open()) return;
    const target = event.target;
    // `event.target` is typed `EventTarget | null` — a plain cast to `Node`
    // would lie about that. A target that isn't a Node can't be "inside" the
    // host element either way, so it's treated the same as outside.
    if (!(target instanceof Node) || !this.elementRef.nativeElement.contains(target)) {
      this.open.set(false);
    }
  }

  protected onEscape(): void {
    this.open.set(false);
  }

  protected async markAllRead(): Promise<void> {
    await this.notifications.markAllRead();
  }

  protected onSelect(row: NotificationRow): void {
    if (!row.read_at) {
      void this.notifications.markRead(row.id);
    }
  }

  protected messageText(row: NotificationRow): string {
    const message = this.notifications.messageFor(row);
    return this.transloco.translate(message.key, message.params);
  }

  protected iconName(row: NotificationRow): string {
    return notificationIcon(row.type).icon;
  }

  protected iconTone(row: NotificationRow) {
    return notificationIcon(row.type).tone;
  }
}
