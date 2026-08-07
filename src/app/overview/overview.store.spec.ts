import { TestBed } from '@angular/core/testing';

import { AuditRepository } from '../audit/audit.repository';
import type { AuditListItem } from '../audit/audit.types';
import { CirculationRepository } from '../circulation/circulation.repository';
import type {
  CheckoutTrendPoint,
  DueTodayLoan,
  OverdueLoan,
} from '../circulation/circulation.types';
import { AppSettingsService } from '../core/app-settings';
import { FinesRepository } from '../fines/fines.repository';
import { HoldsRepository } from '../holds/holds.repository';
import type { HoldListItem } from '../holds/holds.types';
import { OverviewStore } from './overview.store';

function holdRow(overrides: Partial<HoldListItem> = {}): HoldListItem {
  return {
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
    ...overrides,
  };
}

function dueTodayRow(overrides: Partial<DueTodayLoan> = {}): DueTodayLoan {
  return {
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
    ...overrides,
  };
}

function overdueRow(overrides: Partial<OverdueLoan> = {}): OverdueLoan {
  return {
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
    ...overrides,
  };
}

function auditRow(overrides: Partial<AuditListItem> = {}): AuditListItem {
  return {
    id: 'a1',
    actor: 'p1',
    action: 'loan.checkin',
    entity_type: 'loan',
    entity_id: 'l1',
    detail: {},
    created_at: '2026-08-03T09:30:00Z',
    actor_profile: { id: 'p1', full_name: 'Desk Staff', email: 'staff@bookly.local' },
    ...overrides,
  };
}

function trendPoint(overrides: Partial<CheckoutTrendPoint> = {}): CheckoutTrendPoint {
  return { day: '2026-08-03', checkouts: 3, ...overrides };
}

function setup(
  overrides: {
    circulation?: Record<string, unknown>;
    holds?: Record<string, unknown>;
    fines?: Record<string, unknown>;
    audit?: Record<string, unknown>;
  } = {},
) {
  TestBed.configureTestingModule({
    providers: [
      OverviewStore,
      {
        provide: AppSettingsService,
        useValue: {
          currency: () => 'USD',
          load: vi.fn().mockResolvedValue(undefined),
        },
      },
      {
        provide: CirculationRepository,
        useValue: {
          listDueToday: vi.fn().mockResolvedValue({ rows: [dueTodayRow()], total: 1, error: null }),
          listOverdue: vi.fn().mockResolvedValue({ rows: [overdueRow()], total: 1, error: null }),
          getCheckoutTrend: vi.fn().mockResolvedValue({ rows: [trendPoint()], error: null }),
          ...overrides.circulation,
        },
      },
      {
        provide: HoldsRepository,
        useValue: {
          listHolds: vi.fn().mockResolvedValue({ rows: [holdRow()], total: 1, error: null }),
          countByStatus: vi.fn().mockResolvedValue({ count: 2, error: null }),
          ...overrides.holds,
        },
      },
      {
        provide: FinesRepository,
        useValue: {
          summary: vi.fn().mockResolvedValue({
            row: { outstandingBalance: 42.5, collectedTotal: 10, waivedTotal: 0 },
            error: null,
          }),
          ...overrides.fines,
        },
      },
      {
        provide: AuditRepository,
        useValue: {
          listRecent: vi.fn().mockResolvedValue({ rows: [auditRow()], error: null }),
          ...overrides.audit,
        },
      },
    ],
  });
  return TestBed.inject(OverviewStore);
}

describe('OverviewStore', () => {
  it('loads every section in parallel and exposes their results', async () => {
    const store = setup();

    await store.init();

    expect(store.loading()).toBe(false);
    expect(store.holdsReady()).toEqual([holdRow()]);
    expect(store.dueToday()).toEqual([dueTodayRow()]);
    expect(store.topOverdue()).toEqual([overdueRow()]);
    expect(store.overdueCount()).toBe(1);
    expect(store.holdsWaitingCount()).toBe(2);
    expect(store.finesOutstanding()).toBe(42.5);
    expect(store.currency()).toBe('USD');
    expect(store.recentActivity()).toEqual([auditRow()]);
    expect(store.trend()).toEqual([trendPoint()]);
  });

  it('derives the overdue-count stat from the same overdue_loans read as the list (ADR-0002)', async () => {
    const listOverdue = vi
      .fn()
      .mockResolvedValue({
        rows: [overdueRow(), overdueRow({ loan_id: 'l9' })],
        total: 9,
        error: null,
      });
    const store = setup({ circulation: { listOverdue } });

    await store.init();

    expect(store.topOverdue()).toHaveLength(2);
    expect(store.overdueCount()).toBe(9);
  });

  it('keeps every section independent — one failure does not blank the rest', async () => {
    const store = setup({
      holds: {
        listHolds: vi.fn().mockResolvedValue({ rows: [], total: 0, error: 'boom' }),
        countByStatus: vi.fn().mockResolvedValue({ count: 2, error: null }),
      },
    });

    await store.init();

    expect(store.holdsReadyError()).toBe('boom');
    expect(store.holdsReady()).toEqual([]);
    // Unrelated sections still loaded successfully.
    expect(store.dueToday()).toEqual([dueTodayRow()]);
    expect(store.holdsWaitingCount()).toBe(2);
    expect(store.finesOutstanding()).toBe(42.5);
  });

  it('surfaces a due-today load failure without touching other sections', async () => {
    const store = setup({
      circulation: {
        listDueToday: vi.fn().mockResolvedValue({ rows: [], total: 0, error: 'boom' }),
      },
    });

    await store.init();

    expect(store.dueTodayError()).toBe('boom');
    expect(store.dueToday()).toEqual([]);
  });

  it('surfaces a top-overdue load failure without setting the overdue count', async () => {
    const store = setup({
      circulation: {
        listOverdue: vi.fn().mockResolvedValue({ rows: [], total: 0, error: 'boom' }),
      },
    });

    await store.init();

    expect(store.topOverdueError()).toBe('boom');
    expect(store.topOverdue()).toEqual([]);
    expect(store.overdueCount()).toBe(0);
  });

  it('surfaces a holds-waiting count failure', async () => {
    const store = setup({
      holds: {
        countByStatus: vi.fn().mockResolvedValue({ count: 0, error: 'boom' }),
      },
    });

    await store.init();

    expect(store.holdsWaitingCountError()).toBe('boom');
    expect(store.holdsWaitingCount()).toBe(0);
  });

  it('surfaces a fines summary failure and keeps the currency default', async () => {
    const store = setup({
      fines: {
        summary: vi.fn().mockResolvedValue({ row: null, error: 'boom' }),
      },
    });

    await store.init();

    expect(store.finesSummaryError()).toBe('boom');
    expect(store.finesOutstanding()).toBe(0);
    expect(store.currency()).toBe('USD');
  });

  it('surfaces a recent-activity load failure', async () => {
    const store = setup({
      audit: {
        listRecent: vi.fn().mockResolvedValue({ rows: [], error: 'boom' }),
      },
    });

    await store.init();

    expect(store.recentActivityError()).toBe('boom');
    expect(store.recentActivity()).toEqual([]);
  });

  it('surfaces a checkout-trend load failure', async () => {
    const store = setup({
      circulation: {
        getCheckoutTrend: vi.fn().mockResolvedValue({ rows: [], error: 'boom' }),
      },
    });

    await store.init();

    expect(store.trendError()).toBe('boom');
    expect(store.trend()).toEqual([]);
  });

  it('requests the configured page sizes for each limited section', async () => {
    const listHolds = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const listDueToday = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const listOverdue = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const listRecent = vi.fn().mockResolvedValue({ rows: [], error: null });
    const store = setup({
      holds: { listHolds, countByStatus: vi.fn().mockResolvedValue({ count: 0, error: null }) },
      circulation: {
        listDueToday,
        listOverdue,
        getCheckoutTrend: vi.fn().mockResolvedValue({ rows: [], error: null }),
      },
      audit: { listRecent },
    });

    await store.init();

    expect(listHolds).toHaveBeenCalledWith('ready', { page: 1, pageSize: 5 });
    expect(listDueToday).toHaveBeenCalledWith({ page: 1, pageSize: 5 });
    expect(listOverdue).toHaveBeenCalledWith({ page: 1, pageSize: 5 });
    expect(listRecent).toHaveBeenCalledWith(8);
  });

  it('sets loading true while init is in flight and false once settled', async () => {
    let resolveHolds!: (value: { rows: HoldListItem[]; total: number; error: null }) => void;
    const listHolds = vi.fn(
      () =>
        new Promise<{ rows: HoldListItem[]; total: number; error: null }>((resolve) => {
          resolveHolds = resolve;
        }),
    );
    const store = setup({ holds: { listHolds } });

    const initPromise = store.init();
    expect(store.loading()).toBe(true);

    resolveHolds({ rows: [], total: 0, error: null });
    await initPromise;

    expect(store.loading()).toBe(false);
  });
});
