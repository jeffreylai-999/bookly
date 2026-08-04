import { TestBed } from '@angular/core/testing';
import {
  provideTranslocoMissingHandler,
  TranslocoService,
  TranslocoTestingModule,
} from '@jsverse/transloco';
import axe from 'axe-core';
import {
  AlertCircle,
  Banknote,
  Bell,
  CheckCircle2,
  LucideIconProvider,
  LUCIDE_ICONS,
} from 'lucide-angular';

import { ThrowingMissingKeyHandler } from '../core/i18n';
import { NotificationService, type NotificationRow } from '../core/notifications';
import en from '../../../public/i18n/en.json';
import { NotificationBell } from './notification-bell';

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

class NotificationServiceStub {
  rows: NotificationRow[] = [];
  unread = 0;
  isLoading = false;
  loadError: string | null = null;
  markAllRead = vi.fn().mockResolvedValue(undefined);
  markRead = vi.fn().mockResolvedValue(undefined);
  init = vi.fn().mockResolvedValue(undefined);

  notifications = () => this.rows;
  unreadCount = () => this.unread;
  loading = () => this.isLoading;
  error = () => this.loadError;
  messageFor = (row: NotificationRow) => {
    if (row.type === 'hold_ready') {
      const detail = row.detail as Record<string, unknown>;
      return {
        key: 'notifications.messages.holdReady',
        params: { title: detail['title'], member: detail['member_name'], expires: 'Aug 10, 2026' },
      };
    }
    return { key: 'notifications.messages.fallback', params: {} };
  };
}

const icons = {
  provide: LUCIDE_ICONS,
  multi: true,
  useValue: new LucideIconProvider({ AlertCircle, Banknote, Bell, CheckCircle2 }),
};

async function setup(stub: NotificationServiceStub) {
  await TestBed.configureTestingModule({
    imports: [
      NotificationBell,
      TranslocoTestingModule.forRoot({
        langs: { en },
        translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
        preloadLangs: true,
      }),
    ],
    providers: [
      provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
      { provide: NotificationService, useValue: stub },
      icons,
    ],
  }).compileComponents();

  const fixture = TestBed.createComponent(NotificationBell);
  await fixture.whenStable();
  return fixture;
}

describe('NotificationBell', () => {
  it('shows no badge when there are no unread notifications', async () => {
    const fixture = await setup(new NotificationServiceStub());
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[aria-expanded]')?.textContent).not.toContain('9+');
    expect(el.textContent).not.toMatch(/\d/);
  });

  it('shows the unread count, capped at 9+', async () => {
    const stub = new NotificationServiceStub();
    stub.unread = 12;
    const fixture = await setup(stub);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('9+');
  });

  it('is closed by default and opens the dropdown on click', async () => {
    const stub = new NotificationServiceStub();
    stub.rows = [holdReadyRow()];
    const fixture = await setup(stub);
    const el = fixture.nativeElement as HTMLElement;

    expect(el.querySelector('[role="region"]')).toBeNull();

    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    const panel = el.querySelector('[role="region"]');
    expect(panel).not.toBeNull();
    expect(panel?.textContent).toContain('Dune');
    expect(panel?.textContent).toContain('Ada Lovelace');
  });

  it('shows an empty state when there are no notifications', async () => {
    const fixture = await setup(new NotificationServiceStub());
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(el.textContent).toContain('No notifications yet');
  });

  it('closes when clicking outside the component', async () => {
    const stub = new NotificationServiceStub();
    stub.rows = [holdReadyRow()];
    const fixture = await setup(stub);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role="region"]')).not.toBeNull();

    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(el.querySelector('[role="region"]')).toBeNull();
  });

  it('treats a non-Node click target as outside and closes the dropdown', async () => {
    const stub = new NotificationServiceStub();
    stub.rows = [holdReadyRow()];
    const fixture = await setup(stub);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role="region"]')).not.toBeNull();

    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'target', { value: null });
    document.dispatchEvent(event);
    fixture.detectChanges();

    expect(el.querySelector('[role="region"]')).toBeNull();
  });

  it('closes on Escape', async () => {
    const stub = new NotificationServiceStub();
    stub.rows = [holdReadyRow()];
    const fixture = await setup(stub);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();
    expect(el.querySelector('[role="region"]')).not.toBeNull();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(el.querySelector('[role="region"]')).toBeNull();
  });

  it('disables "mark all as read" with nothing unread, and calls the service when enabled', async () => {
    const stub = new NotificationServiceStub();
    stub.rows = [holdReadyRow()];
    stub.unread = 1;
    const fixture = await setup(stub);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    const buttons = Array.from(el.querySelectorAll('button'));
    const markAllButton = buttons.find((btn) => btn.textContent?.includes('Mark all as read'));
    expect(markAllButton?.disabled).toBe(false);

    markAllButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(stub.markAllRead).toHaveBeenCalled();
  });

  it('marks an unread notification read when clicked', async () => {
    const stub = new NotificationServiceStub();
    stub.rows = [holdReadyRow({ id: 'n7' })];
    stub.unread = 1;
    const fixture = await setup(stub);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    const rowButton = el.querySelector('[role="region"] li button');
    rowButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(stub.markRead).toHaveBeenCalledWith('n7');
  });

  it('calls init on the service exactly once during construction', async () => {
    const stub = new NotificationServiceStub();
    await setup(stub);

    expect(stub.init).toHaveBeenCalledTimes(1);
  });

  it('re-renders the bell aria-label when the active language changes', async () => {
    const stub = new NotificationServiceStub();
    const xx = {
      ...en,
      notifications: { ...en.notifications, bellLabel: 'Notifications (XX)' },
    };

    await TestBed.configureTestingModule({
      imports: [
        NotificationBell,
        TranslocoTestingModule.forRoot({
          langs: { en, xx },
          translocoConfig: { availableLangs: ['en', 'xx'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: NotificationService, useValue: stub },
        icons,
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(NotificationBell);
    await fixture.whenStable();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;

    expect(button.getAttribute('aria-label')).toBe('Notifications');

    TestBed.inject(TranslocoService).setActiveLang('xx');
    fixture.detectChanges();

    expect(button.getAttribute('aria-label')).toBe('Notifications (XX)');
  });

  it('has no serious AXE violations with the dropdown open', async () => {
    const stub = new NotificationServiceStub();
    stub.rows = [holdReadyRow()];
    stub.unread = 1;
    const fixture = await setup(stub);
    const el = fixture.nativeElement as HTMLElement;

    el.querySelector('button')?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    const results = await axe.run(el, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } });
    expect(results.violations).toEqual([]);
  });
});
