import { PendingTasks } from '@angular/core';
import { TestBed } from '@angular/core/testing';

import { AuditRepository } from './audit.repository';
import { AuditStore } from './audit.store';
import type { AuditListItem } from './audit.types';

const sampleRow: AuditListItem = {
  id: 'log1',
  actor: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002',
  action: 'member.create',
  entity_type: 'member',
  entity_id: 'm1',
  detail: { name: 'Ada' },
  created_at: '2026-07-15T12:00:00Z',
  actor_profile: {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002',
    full_name: 'Admin Member Test',
    email: 'admin@bookly.local',
  },
};

describe('AuditStore', () => {
  it('loads rows and actors on init', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [sampleRow], total: 1, error: null });
    const listActors = vi.fn().mockResolvedValue({ rows: [sampleRow.actor_profile], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    await store.init();

    expect(list).toHaveBeenCalledWith({
      page: 1,
      pageSize: 10,
      actorId: 'all',
      action: 'all',
      entityType: 'all',
      fromDate: '',
      toDate: '',
    });
    expect(listActors).toHaveBeenCalled();
    expect(store.rows()).toEqual([sampleRow]);
    expect(store.total()).toBe(1);
    expect(store.actors()).toEqual([sampleRow.actor_profile]);
    expect(store.empty()).toBe(false);
  });

  it('composes filters and resets to page 1', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    await store.setPage(3);
    await store.setActorId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002');
    await store.setAction('member.status');
    await store.setEntityType('member');
    await store.setFromDate('2026-07-01');
    await store.setToDate('2026-07-31');

    expect(store.page()).toBe(1);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        actorId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002',
        action: 'member.status',
        entityType: 'member',
        fromDate: '2026-07-01',
        toDate: '2026-07-31',
      }),
    );
    expect(store.hasActiveFilters()).toBe(true);
    expect(store.empty()).toBe(true);
  });

  it('reloads page 1 when a populated result makes the selected page out of range', async () => {
    // Page 2's own response is empty (matching a shrunk result set) and is
    // distinct from page 1's response, so the final rows can only be
    // explained by the clamp actually re-requesting and applying page 1 —
    // not by page 2's response being reused as-is.
    const list = vi
      .fn()
      .mockImplementation(({ page }: { page: number }) =>
        Promise.resolve(
          page === 2
            ? { rows: [], total: 1, error: null }
            : { rows: [sampleRow], total: 1, error: null },
        ),
      );
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    await store.setPage(2);

    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ page: 1 }));
    expect(store.page()).toBe(1);
    expect(store.rows()).toEqual([sampleRow]);
  });

  it('maps repository list errors to load_failed', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: 'database unavailable' });
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    await store.load();

    expect(store.error()).toBe('load_failed');
  });

  it('keeps actor-roster failures off the list error/empty signals', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [sampleRow], total: 1, error: null });
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: 'actors unavailable' });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    await store.init();

    expect(store.error()).toBeNull();
    expect(store.actorsError()).toBe('actors unavailable');
    expect(store.rows()).toEqual([sampleRow]);
    expect(store.empty()).toBe(false);
  });

  it('skips the list query when the date range is inverted', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [sampleRow], total: 1, error: null });
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    await store.setFromDate('2026-07-31');
    list.mockClear();
    await store.setToDate('2026-07-01');

    expect(store.dateRangeInvalid()).toBe(true);
    expect(list).not.toHaveBeenCalled();
    expect(store.rows()).toEqual([]);
    expect(store.total()).toBe(0);
    // An inverted range is never a successful, valid empty result — the
    // empty state must not tell staff "no matching activity".
    expect(store.empty()).toBe(false);
  });

  it('invalidates a stale in-flight load when the date range becomes invalid mid-flight', async () => {
    let slowLoaderStarted = false;
    let resolveSlow: (value: { rows: AuditListItem[]; total: number; error: null }) => void = () =>
      undefined;
    const list = vi.fn().mockImplementation(() => {
      slowLoaderStarted = true;
      return new Promise<{ rows: AuditListItem[]; total: number; error: null }>((resolve) => {
        resolveSlow = resolve;
      });
    });
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    const staleLoad = store.setFromDate('2026-07-01');
    await vi.waitFor(() => expect(slowLoaderStarted).toBe(true));

    // Flips the range invalid (from > to) while the above load is still
    // in flight, without ever letting it settle on its own.
    await store.setToDate('2026-06-01');

    expect(store.dateRangeInvalid()).toBe(true);
    expect(list).toHaveBeenCalledTimes(1);

    // The superseded load must resolve rather than hang forever.
    await staleLoad;
    expect(store.rows()).toEqual([]);
    expect(store.total()).toBe(0);

    // A late resolution of the abandoned repository call must not resurrect
    // stale rows or trigger a stray reload/clamp.
    resolveSlow({ rows: [sampleRow], total: 1, error: null });
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(list).toHaveBeenCalledTimes(1);
    expect(store.rows()).toEqual([]);
    expect(store.total()).toBe(0);
  });

  it('clears all filters together', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    await store.setActorId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002');
    await store.setAction('member.create');
    await store.setEntityType('member');
    await store.setFromDate('2026-07-01');
    await store.setToDate('2026-07-31');
    await store.clearFilters();

    expect(store.actorId()).toBe('all');
    expect(store.action()).toBe('all');
    expect(store.entityType()).toBe('all');
    expect(store.fromDate()).toBe('');
    expect(store.toDate()).toBe('');
    expect(store.hasActiveFilters()).toBe(false);
  });

  it('keeps showing the previous page while a new filter is still loading (sticky value)', async () => {
    let resolveSecond: (value: {
      rows: AuditListItem[];
      total: number;
      error: null;
    }) => void = () => undefined;
    let calls = 0;
    const list = vi.fn().mockImplementation(() => {
      calls += 1;
      if (calls === 1) {
        return Promise.resolve({ rows: [sampleRow], total: 1, error: null });
      }
      return new Promise((resolve) => {
        resolveSecond = resolve;
      });
    });
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    await store.load();
    expect(store.rows()).toEqual([sampleRow]);

    const reload = store.setAction('member.status');
    await vi.waitFor(() => expect(calls).toBe(2));
    expect(store.loading()).toBe(true);
    expect(store.rows()).toEqual([sampleRow]);

    resolveSecond({ rows: [], total: 0, error: null });
    await reload;

    expect(store.rows()).toEqual([]);
  });

  it('resolves load() even while an unrelated app-wide task is pending (regression: no ApplicationRef.whenStable() bridge)', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [sampleRow], total: 1, error: null });
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    // Simulates an unrelated long-lived pending task elsewhere in the app —
    // e.g. another component's own in-flight request started around
    // `ngOnInit`. A settlement bridge scoped to this app's global stability
    // would wait on this forever; a request-scoped one must not.
    const releaseUnrelatedTask = TestBed.inject(PendingTasks).add();
    try {
      await store.load();
    } finally {
      releaseUnrelatedTask();
    }

    expect(store.rows()).toEqual([sampleRow]);
    expect(store.loading()).toBe(false);
  });
});
