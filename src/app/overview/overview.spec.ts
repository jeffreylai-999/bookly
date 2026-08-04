import { CurrencyPipe, DatePipe } from '@angular/common';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule, provideTranslocoMissingHandler } from '@jsverse/transloco';
import axe from 'axe-core';
import {
  AlertCircle,
  Banknote,
  BookOpen,
  CheckCircle2,
  Clock,
  Hand,
  LUCIDE_ICONS,
  LucideIconProvider,
  Repeat,
  Settings,
  User,
} from 'lucide-angular';

import en from '../../../public/i18n/en.json';
import { ThrowingMissingKeyHandler } from '../core/i18n';
import type { AuditListItem } from '../audit/audit.types';
import type {
  CheckoutTrendPoint,
  DueTodayLoan,
  OverdueLoan,
} from '../circulation/circulation.types';
import type { HoldListItem } from '../holds/holds.types';
import { Overview, parseViewDate } from './overview';
import { OverviewStore } from './overview.store';

const holdRow: HoldListItem = {
  id: 'h1',
  title_id: 't1',
  member_id: 'm1',
  queue_position: 1,
  status: 'ready',
  copy_id: 'c1',
  ready_at: '2026-08-03T09:00:00Z',
  expires_at: '2026-08-10T09:00:00Z',
  created_at: '2026-07-30T00:00:00Z',
  title: { title: 'Foundation', author: 'Asimov' },
  member: { name: 'Ada Lovelace', card_barcode: 'MBR-1001' },
  copy: { barcode: 'BK-100' },
};

const dueTodayRow: DueTodayLoan = {
  loan_id: 'l1',
  copy_id: 'c1',
  copy_barcode: 'BK-200',
  title_id: 't2',
  title: 'Dune',
  author: 'Herbert',
  member_id: 'm2',
  member_name: 'Alan Turing',
  member_card_barcode: 'MBR-1002',
  checked_out_at: '2026-07-20T00:00:00Z',
  due_at: '2026-08-03T18:00:00Z',
};

const overdueRow: OverdueLoan = {
  loan_id: 'l2',
  copy_id: 'c2',
  copy_barcode: 'BK-300',
  title_id: 't3',
  title: 'Snow Crash',
  author: 'Stephenson',
  member_id: 'm3',
  member_name: 'Grace Hopper',
  member_card_barcode: 'MBR-1003',
  checked_out_at: '2026-07-01T00:00:00Z',
  due_at: '2026-07-22T00:00:00Z',
  days_late: 6,
  fine_rate_per_day: 0.25,
  projected_fine: 1.5,
};

const activityRow: AuditListItem = {
  id: 'a1',
  actor: 'p1',
  action: 'loan.checkin',
  entity_type: 'loan',
  entity_id: 'l1',
  detail: {},
  created_at: '2026-08-03T09:30:00Z',
  actor_profile: { id: 'p1', full_name: 'Desk Staff', email: 'staff@bookly.local' },
};

const trendPoint: CheckoutTrendPoint = { day: '2026-08-03', checkouts: 3 };

describe('Overview', () => {
  async function setup(storeOverrides: Record<string, unknown> = {}) {
    const store = {
      loading: signal(false).asReadonly(),
      holdsReady: signal<HoldListItem[]>([holdRow]).asReadonly(),
      holdsReadyError: signal<string | null>(null).asReadonly(),
      dueToday: signal<DueTodayLoan[]>([dueTodayRow]).asReadonly(),
      dueTodayError: signal<string | null>(null).asReadonly(),
      topOverdue: signal<OverdueLoan[]>([overdueRow]).asReadonly(),
      topOverdueError: signal<string | null>(null).asReadonly(),
      overdueCount: signal(1).asReadonly(),
      holdsWaitingCount: signal(3).asReadonly(),
      holdsWaitingCountError: signal<string | null>(null).asReadonly(),
      finesOutstanding: signal(42.5).asReadonly(),
      finesSummaryError: signal<string | null>(null).asReadonly(),
      currency: signal('USD').asReadonly(),
      recentActivity: signal<AuditListItem[]>([activityRow]).asReadonly(),
      recentActivityError: signal<string | null>(null).asReadonly(),
      trend: signal<CheckoutTrendPoint[]>([trendPoint]).asReadonly(),
      trendError: signal<string | null>(null).asReadonly(),
      init: vi.fn().mockResolvedValue(undefined),
      ...storeOverrides,
    };

    await TestBed.configureTestingModule({
      imports: [
        Overview,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({
            AlertCircle,
            Banknote,
            BookOpen,
            CheckCircle2,
            Clock,
            Hand,
            Repeat,
            Settings,
            User,
          }),
        },
      ],
    })
      .overrideComponent(Overview, {
        set: { providers: [{ provide: OverviewStore, useValue: store }, CurrencyPipe, DatePipe] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(Overview);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, store };
  }

  it('shows a loading skeleton and calls init once', async () => {
    const { fixture, store } = await setup({ loading: signal(true).asReadonly() });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[role="status"]')).not.toBeNull();
    expect(store.init).toHaveBeenCalledTimes(1);
  });

  it('deep-links the quick actions into the Circulation flows', async () => {
    const { fixture } = await setup();
    const host = fixture.nativeElement as HTMLElement;
    const links = [...host.querySelectorAll('a')];

    const checkoutLink = links.find((a) => (a.textContent ?? '').includes('Check out'));
    const checkinLink = links.find((a) => (a.textContent ?? '').includes('Check in'));

    expect(checkoutLink?.getAttribute('href')).toBe('/circulation');
    expect(checkinLink?.getAttribute('href')).toBe('/circulation?tab=checkin');
  });

  it('renders the decision stat cards', async () => {
    const { fixture } = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Overdue loans');
    expect(text).toContain('Holds waiting');
    expect(text).toContain('Fines outstanding');
    expect(text).toContain('$42.50');
  });

  it('lists holds ready for pickup, due today, and top overdue with amounts from the store', async () => {
    const { fixture } = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Foundation');
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Dune');
    expect(text).toContain('Alan Turing');
    expect(text).toContain('Snow Crash');
    expect(text).toContain('Grace Hopper');
    expect(text).toContain('6d late');
    expect(text).toContain('$1.50');
  });

  it('renders the recent-activity feed with a translated action label', async () => {
    const { fixture } = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('Checked in');
    expect(text).toContain('Desk Staff');
  });

  it('shows designed empty states for each action list and the activity feed', async () => {
    const { fixture } = await setup({
      holdsReady: signal<HoldListItem[]>([]).asReadonly(),
      dueToday: signal<DueTodayLoan[]>([]).asReadonly(),
      topOverdue: signal<OverdueLoan[]>([]).asReadonly(),
      recentActivity: signal<AuditListItem[]>([]).asReadonly(),
    });
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';

    expect(text).toContain('No holds ready');
    expect(text).toContain('Nothing due today');
    expect(text).toContain('Nothing overdue');
    expect(text).toContain('No recent activity');
  });

  it('surfaces a section load failure without hiding the rest of the page', async () => {
    const { fixture } = await setup({
      holdsReadyError: signal('boom').asReadonly(),
    });
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[role="alert"]')?.textContent).toContain(
      "Couldn't load holds ready for pickup.",
    );
    // Unrelated section keeps rendering.
    expect(host.textContent ?? '').toContain('Dune');
  });

  it('shows an unavailable placeholder for a stat card on its own load error, never a bare 0', async () => {
    const { fixture } = await setup({
      topOverdueError: signal('boom').asReadonly(),
      holdsWaitingCountError: signal('boom').asReadonly(),
      finesSummaryError: signal('boom').asReadonly(),
    });
    const values = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="kpi-value"]'),
    ].map((el) => el.textContent?.trim());

    // Real defaults (0, 3, $42.50) never render once their section errored —
    // a bare 0 / $0.00 there would look like real data instead of a failed read.
    expect(values).toEqual(['—', '—', '—']);
  });

  it('still shows the real stat values when nothing errored', async () => {
    const { fixture } = await setup();
    const values = [
      ...(fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="kpi-value"]'),
    ].map((el) => el.textContent?.trim());

    expect(values).toEqual(['1', '3', '$42.50']);
  });

  it('renders the checkout trend for the day the store returned, in a negative-offset timezone', async () => {
    vi.stubEnv('TZ', 'America/New_York');
    try {
      const { fixture } = await setup({
        trend: signal<CheckoutTrendPoint[]>([{ day: '2026-08-03', checkouts: 5 }]).asReadonly(),
      });
      const host = fixture.nativeElement as HTMLElement;

      // 2026-08-03 is a Monday. A UTC-instant parse of that date-only string
      // would roll it back to Sunday here.
      expect(host.textContent ?? '').toContain('Mon');
      expect(host.textContent ?? '').not.toContain('Sun');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  describe('parseViewDate', () => {
    it('builds a local midnight for the given calendar date, not a UTC instant', () => {
      const date = parseViewDate('2026-08-03');

      // Asserting the *local* getters (not getUTC*) is the point: a UTC-instant
      // parse of a date-only string rolls this back to Aug 2 in any
      // negative-offset timezone, which would fail this exact assertion there.
      expect(date.getFullYear()).toBe(2026);
      expect(date.getMonth()).toBe(7);
      expect(date.getDate()).toBe(3);
      expect(date.getHours()).toBe(0);
    });

    it('stays on the same calendar date in a negative-offset timezone', () => {
      // Pinned via vi.stubEnv rather than process.env directly: tsconfig.spec.json
      // scopes "types" to vitest/globals only, so `process` isn't declared there.
      vi.stubEnv('TZ', 'America/New_York');
      try {
        const date = parseViewDate('2026-08-03');
        expect(date.getFullYear()).toBe(2026);
        expect(date.getMonth()).toBe(7);
        expect(date.getDate()).toBe(3);
        expect(date.getHours()).toBe(0);
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });

  it('has no serious accessibility violations', async () => {
    const { fixture } = await setup();
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no serious accessibility violations while loading', async () => {
    const { fixture } = await setup({ loading: signal(true).asReadonly() });
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
