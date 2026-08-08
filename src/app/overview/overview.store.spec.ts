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

type RepoKey = 'circulation' | 'holds' | 'fines' | 'audit';

/**
 * One row per section the briefing reads, so the wiring — which repository
 * call backs it, with which arguments, and which signals it feeds — is
 * asserted for every section instead of a chosen few.
 */
const sections: {
  label: string;
  repo: RepoKey;
  method: string;
  args: unknown[];
  ok: unknown;
  failed: unknown;
  loaded: unknown;
  blank: unknown;
  read: (store: OverviewStore) => unknown;
  readError: (store: OverviewStore) => string | null;
}[] = [
  {
    label: 'holds ready',
    repo: 'holds',
    method: 'listHolds',
    args: ['ready', { page: 1, pageSize: 5 }],
    ok: { rows: [holdRow()], total: 1, error: null },
    failed: { rows: [], total: 0, error: 'boom' },
    loaded: [holdRow()],
    blank: [],
    read: (store) => store.holdsReady(),
    readError: (store) => store.holdsReadyError(),
  },
  {
    label: 'due today',
    repo: 'circulation',
    method: 'listDueToday',
    args: [{ page: 1, pageSize: 5 }],
    ok: { rows: [dueTodayRow()], total: 1, error: null },
    failed: { rows: [], total: 0, error: 'boom' },
    loaded: [dueTodayRow()],
    blank: [],
    read: (store) => store.dueToday(),
    readError: (store) => store.dueTodayError(),
  },
  {
    label: 'top overdue',
    repo: 'circulation',
    method: 'listOverdue',
    args: [{ page: 1, pageSize: 5 }],
    ok: { rows: [overdueRow()], total: 1, error: null },
    failed: { rows: [], total: 0, error: 'boom' },
    loaded: [overdueRow()],
    blank: [],
    read: (store) => store.topOverdue(),
    readError: (store) => store.topOverdueError(),
  },
  {
    label: 'holds waiting count',
    repo: 'holds',
    method: 'countByStatus',
    args: ['waiting'],
    ok: { count: 2, error: null },
    failed: { count: 0, error: 'boom' },
    loaded: 2,
    blank: 0,
    read: (store) => store.holdsWaitingCount(),
    readError: (store) => store.holdsWaitingCountError(),
  },
  {
    label: 'fines summary',
    repo: 'fines',
    method: 'summary',
    args: [],
    ok: { row: { outstandingBalance: 42.5, collectedTotal: 10, waivedTotal: 0 }, error: null },
    failed: { row: null, error: 'boom' },
    loaded: 42.5,
    blank: 0,
    read: (store) => store.finesOutstanding(),
    readError: (store) => store.finesSummaryError(),
  },
  {
    label: 'recent activity',
    repo: 'audit',
    method: 'listRecent',
    args: [8],
    ok: { rows: [auditRow()], error: null },
    failed: { rows: [], error: 'boom' },
    loaded: [auditRow()],
    blank: [],
    read: (store) => store.recentActivity(),
    readError: (store) => store.recentActivityError(),
  },
  {
    label: 'checkout trend',
    repo: 'circulation',
    method: 'getCheckoutTrend',
    args: [],
    ok: { rows: [trendPoint()], error: null },
    failed: { rows: [], error: 'boom' },
    loaded: [trendPoint()],
    blank: [],
    read: (store) => store.trend(),
    readError: (store) => store.trendError(),
  },
];

function setup(
  overrides: {
    appSettings?: Record<string, unknown>;
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
          ...overrides.appSettings,
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

  it.each(sections)(
    '$label reads through its own repository call and exposes its result',
    async ({ repo, method, args, ok, loaded, read, readError }) => {
      const call = vi.fn().mockResolvedValue(ok);
      const store = setup({ [repo]: { [method]: call } });

      await store.init();

      expect(call).toHaveBeenCalledWith(...args);
      expect(read(store)).toEqual(loaded);
      expect(readError(store)).toBeNull();
    },
  );

  it.each(sections)(
    '$label surfaces its own failure text and leaves every other section intact',
    async (section) => {
      const store = setup({
        [section.repo]: { [section.method]: vi.fn().mockResolvedValue(section.failed) },
      });

      await store.init();

      expect(section.readError(store)).toBe('boom');
      expect(section.read(store)).toEqual(section.blank);
      for (const other of sections.filter((s) => s.label !== section.label)) {
        expect(other.readError(store), `${other.label} should be unaffected`).toBeNull();
        expect(other.read(store)).toEqual(other.loaded);
      }
    },
  );

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

  it('surfaces a rejected read (e.g. a network-level failure) as the section error', async () => {
    const store = setup({
      audit: { listRecent: vi.fn().mockRejectedValue(new Error('network down')) },
    });

    await store.init();

    expect(store.recentActivityError()).toBe('network down');
    expect(store.recentActivity()).toEqual([]);
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

    await vi.waitFor(() => {
      expect(listHolds).toHaveBeenCalled();
    });
    resolveHolds({ rows: [], total: 0, error: null });
    await initPromise;

    expect(store.loading()).toBe(false);
  });

  it('keeps loading true while settings load after all overview reads settle', async () => {
    let resolveSettings!: () => void;
    const load = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSettings = resolve;
        }),
    );
    const store = setup({ appSettings: { load } });

    const initPromise = store.init();

    await vi.waitFor(() => {
      expect(store.holdsReady()).toEqual([holdRow()]);
      expect(store.dueToday()).toEqual([dueTodayRow()]);
      expect(store.topOverdue()).toEqual([overdueRow()]);
      expect(store.holdsWaitingCount()).toBe(2);
      expect(store.finesOutstanding()).toBe(42.5);
      expect(store.recentActivity()).toEqual([auditRow()]);
      expect(store.trend()).toEqual([trendPoint()]);
      expect(store.loading()).toBe(true);
    });

    resolveSettings();
    await initPromise;

    expect(store.loading()).toBe(false);
  });

  it('keeps loading true when an earlier settings load settles before the active one', async () => {
    let resolveFirstSettings!: () => void;
    let resolveSecondSettings!: () => void;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveFirstSettings = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            resolveSecondSettings = resolve;
          }),
      );
    const store = setup({ appSettings: { load } });

    const firstInit = store.init();
    await vi.waitFor(() => {
      expect(load).toHaveBeenCalledTimes(1);
    });
    const secondInit = store.init();
    await vi.waitFor(() => {
      expect(load).toHaveBeenCalledTimes(2);
    });

    resolveFirstSettings();
    await vi.waitFor(() => {
      expect(store.holdsReady()).toEqual([holdRow()]);
      expect(store.dueToday()).toEqual([dueTodayRow()]);
      expect(store.topOverdue()).toEqual([overdueRow()]);
      expect(store.holdsWaitingCount()).toBe(2);
      expect(store.finesOutstanding()).toBe(42.5);
      expect(store.recentActivity()).toEqual([auditRow()]);
      expect(store.trend()).toEqual([trendPoint()]);
      expect(store.loading()).toBe(true);
    });

    resolveSecondSettings();
    await Promise.all([firstInit, secondInit]);

    expect(store.loading()).toBe(false);
  });

  it('keeps the latest overview result when an earlier initialization settles late', async () => {
    let resolveInitialHolds!: (value: {
      rows: HoldListItem[];
      total: number;
      error: null;
    }) => void;
    const listHolds = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<{ rows: HoldListItem[]; total: number; error: null }>((resolve) => {
            resolveInitialHolds = resolve;
          }),
      )
      .mockResolvedValueOnce({ rows: [holdRow({ id: 'latest' })], total: 1, error: null });
    const store = setup({ holds: { listHolds } });

    void store.init();
    await vi.waitFor(() => {
      expect(listHolds).toHaveBeenCalledTimes(1);
    });
    void store.init();
    await vi.waitFor(() => {
      expect(listHolds).toHaveBeenCalledTimes(2);
    });
    resolveInitialHolds({ rows: [holdRow({ id: 'stale' })], total: 1, error: null });

    await vi.waitFor(() => {
      expect(store.holdsReady()).toEqual([holdRow({ id: 'latest' })]);
    });
  });
});
