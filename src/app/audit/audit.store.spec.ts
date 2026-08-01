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
    const listActors = vi
      .fn()
      .mockResolvedValue({ rows: [sampleRow.actor_profile], error: null });

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

  it('clears all filters together', async () => {
    const list = vi.fn().mockResolvedValue({ rows: [], total: 0, error: null });
    const listActors = vi.fn().mockResolvedValue({ rows: [], error: null });

    await TestBed.configureTestingModule({
      providers: [AuditStore, { provide: AuditRepository, useValue: { list, listActors } }],
    }).compileComponents();

    const store = TestBed.inject(AuditStore);
    await store.setActorId('aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002');
    await store.setAction('member.create');
    await store.setFromDate('2026-07-01');
    await store.clearFilters();

    expect(store.actorId()).toBe('all');
    expect(store.action()).toBe('all');
    expect(store.fromDate()).toBe('');
    expect(store.hasActiveFilters()).toBe(false);
  });
});
