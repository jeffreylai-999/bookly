import { TestBed } from '@angular/core/testing';

import { HoldsRepository } from './holds.repository';
import { HoldsStore } from './holds.store';
import type { HoldListItem } from './holds.types';

function holdRow(overrides: Partial<HoldListItem>): HoldListItem {
  return {
    id: 'h1',
    title_id: 't1',
    member_id: 'm1',
    queue_position: 1,
    status: 'waiting',
    copy_id: null,
    ready_at: null,
    expires_at: null,
    created_at: '2026-07-20T00:00:00Z',
    title: { title: 'Dune', author: 'Herbert' },
    member: { name: 'Ada', card_barcode: 'MBR-1' },
    copy: null,
    ...overrides,
  };
}

function setup(repoOverrides: Record<string, unknown> = {}) {
  TestBed.configureTestingModule({
    providers: [
      HoldsStore,
      {
        provide: HoldsRepository,
        useValue: {
          listHolds: vi.fn().mockResolvedValue({ rows: [], total: 0, error: null }),
          markReady: vi.fn().mockResolvedValue({ ok: true, hold: holdRow({}) }),
          cancelHold: vi.fn().mockResolvedValue({ ok: true }),
          ...repoOverrides,
        },
      },
    ],
  });
  return TestBed.inject(HoldsStore);
}

describe('HoldsStore', () => {
  it('loads holds and exposes the result count', async () => {
    const row = holdRow({});
    const store = setup({
      listHolds: vi.fn().mockResolvedValue({ rows: [row], total: 1, error: null }),
    });

    await store.load();

    expect(store.rows()).toEqual([row]);
    expect(store.total()).toBe(1);
    expect(store.isEmpty()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('reports a load failure without flagging the list as empty-state ready', async () => {
    const store = setup({
      listHolds: vi.fn().mockResolvedValue({ rows: [], total: 0, error: 'boom' }),
    });

    await store.load();

    expect(store.error()).toBe('load_failed');
    expect(store.isEmpty()).toBe(false);
  });

  it('applies the status filter and resets to the first page', async () => {
    const listHolds = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const store = setup({ listHolds });

    await store.applyPage(2);
    await store.applyStatus('ready');

    expect(store.status()).toBe('ready');
    expect(store.page()).toBe(1);
    expect(store.hasActiveFilters()).toBe(true);
    expect(listHolds).toHaveBeenLastCalledWith('ready', { page: 1, pageSize: 10 });
  });

  it('flags only the queue head of each title as mark-readyable', async () => {
    const rows = [
      holdRow({ id: 'h1', title_id: 't1', queue_position: 2 }),
      holdRow({ id: 'h2', title_id: 't1', queue_position: 3 }),
      holdRow({ id: 'h3', title_id: 't2', queue_position: 1 }),
      holdRow({ id: 'h4', title_id: 't2', queue_position: 2, status: 'ready' }),
    ];
    const store = setup({
      listHolds: vi.fn().mockResolvedValue({ rows, total: 4, error: null }),
    });

    await store.load();

    expect([...store.queueHeadIds()].sort()).toEqual(['h1', 'h3']);
  });

  it('marks ready and reloads the queue', async () => {
    const listHolds = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const markReady = vi.fn().mockResolvedValue({ ok: true, hold: holdRow({}) });
    const store = setup({ listHolds, markReady });
    await store.load();
    listHolds.mockClear();

    const result = await store.markReady('t1', 'BK-001');

    expect(result).toEqual({ ok: true });
    expect(markReady).toHaveBeenCalledWith('t1', 'BK-001');
    expect(listHolds).toHaveBeenCalled();
    expect(store.busyId()).toBeNull();
  });

  it('surfaces a typed mark-ready error without reloading', async () => {
    const listHolds = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const store = setup({
      listHolds,
      markReady: vi.fn().mockResolvedValue({ ok: false, error: 'no_waiting_holds' }),
    });
    await store.load();
    listHolds.mockClear();

    const result = await store.markReady('t1', 'BK-001');

    expect(result).toEqual({ ok: false, error: 'no_waiting_holds' });
    expect(listHolds).not.toHaveBeenCalled();
    expect(store.busyId()).toBeNull();
  });

  it('cancels a hold and reloads', async () => {
    const listHolds = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const cancelHold = vi.fn().mockResolvedValue({ ok: true });
    const store = setup({ listHolds, cancelHold });
    await store.load();
    listHolds.mockClear();

    const result = await store.cancelHold('h1');

    expect(result).toEqual({ ok: true });
    expect(cancelHold).toHaveBeenCalledWith('h1');
    expect(listHolds).toHaveBeenCalled();
  });

  it('keeps the previous rows visible while a filter load is in flight', async () => {
    const first = holdRow({ id: 'h-first' });
    const deferred: {
      resolve: (value: { rows: HoldListItem[]; total: number; error: null }) => void;
    } = {
      resolve: () => undefined,
    };
    const listHolds = vi.fn().mockImplementation(async (status: string) => {
      if (status === '') {
        return { rows: [first], total: 1, error: null };
      }
      return new Promise<{ rows: HoldListItem[]; total: number; error: null }>((resolve) => {
        deferred.resolve = resolve;
      });
    });
    const store = setup({ listHolds });
    await store.load();

    const pending = store.applyStatus('waiting');
    await vi.waitFor(() => {
      expect(listHolds).toHaveBeenCalledWith('waiting', { page: 1, pageSize: 10 });
    });
    expect(store.loading()).toBe(true);
    expect(store.rows()).toEqual([first]);

    deferred.resolve({ rows: [], total: 0, error: null });
    await pending;

    expect(store.rows()).toEqual([]);
    expect(store.loading()).toBe(false);
  });

  it('ignores stale load results after a newer load starts', async () => {
    const deferred: {
      resolve: (value: { rows: HoldListItem[]; total: number; error: null }) => void;
    } = {
      resolve: () => undefined,
    };
    const readyRow = holdRow({ id: 'h-ready', status: 'ready' });
    const listHolds = vi.fn().mockImplementation(async (status: string) => {
      if (status === 'waiting') {
        return new Promise<{ rows: HoldListItem[]; total: number; error: null }>((resolve) => {
          deferred.resolve = resolve;
        });
      }
      return { rows: [readyRow], total: 1, error: null };
    });
    const store = setup({ listHolds });

    const slow = store.applyStatus('waiting');
    await store.applyStatus('ready');
    deferred.resolve({ rows: [], total: 0, error: null });
    await slow;

    expect(store.status()).toBe('ready');
    expect(store.rows()).toEqual([readyRow]);
    expect(store.total()).toBe(1);
  });

  it('clamps an out-of-range page and reloads', async () => {
    const listHolds = vi
      .fn()
      .mockResolvedValueOnce({ rows: [], total: 5, error: null })
      .mockResolvedValueOnce({
        rows: [holdRow({ id: 'h-page1' })],
        total: 5,
        error: null,
      });
    const store = setup({ listHolds });

    await store.applyPage(9);

    expect(store.page()).toBe(1);
    expect(store.rows()).toEqual([holdRow({ id: 'h-page1' })]);
    expect(listHolds).toHaveBeenCalledTimes(2);
    expect(listHolds).toHaveBeenLastCalledWith('', { page: 1, pageSize: 10 });
  });
});
