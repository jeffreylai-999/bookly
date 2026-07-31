import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslocoMissingHandler, TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';
import {
  ChevronLeft,
  ChevronRight,
  LUCIDE_ICONS,
  LucideIconProvider,
  Search,
  X,
} from 'lucide-angular';

import { AuthService } from '../core/auth';
import { ThrowingMissingKeyHandler } from '../core/i18n';
import en from '../../../public/i18n/en.json';
import { MembersList } from './members-list';
import { MembersStore } from './members.store';
import type { MemberListItem } from './members.types';

const sample: MemberListItem = {
  id: 'm1',
  name: 'Ada Lovelace',
  member_type_id: 't1',
  email: null,
  phone: null,
  avatar_url: null,
  status: 'active',
  joined_at: '2026-01-15T00:00:00Z',
  card_barcode: 'MBR-ADA-1',
  created_at: '2026-01-15T00:00:00Z',
  member_type: { id: 't1', name: 'Adult' },
};

const lucideIcons = {
  provide: LUCIDE_ICONS,
  multi: true,
  useValue: new LucideIconProvider({ ChevronLeft, ChevronRight, Search, X }),
};

function createStoreFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rows: signal([sample]).asReadonly(),
    total: signal(1).asReadonly(),
    page: signal(1).asReadonly(),
    pageSize: 10,
    nameSearch: signal('').asReadonly(),
    statusFilter: signal('all' as const).asReadonly(),
    loading: signal(false).asReadonly(),
    saving: signal(false).asReadonly(),
    error: signal<string | null>(null).asReadonly(),
    memberTypes: signal([{ id: 't1', name: 'Adult' }]).asReadonly(),
    empty: signal(false).asReadonly(),
    hasActiveFilters: signal(false).asReadonly(),
    init: vi.fn().mockResolvedValue(undefined),
    setNameSearch: vi.fn(),
    setStatusFilter: vi.fn(),
    setPage: vi.fn(),
    clearFilters: vi.fn(),
    createMember: vi.fn(),
    updateMember: vi.fn(),
    setMemberStatus: vi.fn(),
    ...overrides,
  };
}

describe('MembersList', () => {
  it('renders the empty state when there are no members', async () => {
    const store = createStoreFake({
      rows: signal([]).asReadonly(),
      total: signal(0).asReadonly(),
      empty: signal(true).asReadonly(),
    });

    await TestBed.configureTestingModule({
      imports: [
        MembersList,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        lucideIcons,
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: MembersStore, useValue: store },
        {
          provide: AuthService,
          useValue: { isAdmin: signal(false).asReadonly() },
        },
      ],
    })
      .overrideComponent(MembersList, { set: { providers: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(MembersList);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('No members yet');
    expect(fixture.nativeElement.textContent).toContain('Add member');
  });

  it('hides block actions for staff and shows them for admin', async () => {
    const isAdmin = signal(false);

    await TestBed.configureTestingModule({
      imports: [
        MembersList,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        lucideIcons,
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: MembersStore, useValue: createStoreFake() },
        { provide: AuthService, useValue: { isAdmin: isAdmin.asReadonly() } },
      ],
    })
      .overrideComponent(MembersList, { set: { providers: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(MembersList);
    await fixture.whenStable();

    const actionLabels = () =>
      Array.from(
        (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
      ).map((btn) => btn.textContent?.trim() ?? '');

    expect(actionLabels()).toContain('Suspend');
    expect(actionLabels()).not.toContain('Block');

    isAdmin.set(true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(actionLabels()).toContain('Block');
  });

  it('passes AXE wcag2a/aa on the empty state', async () => {
    const store = createStoreFake({
      rows: signal([]).asReadonly(),
      total: signal(0).asReadonly(),
      empty: signal(true).asReadonly(),
    });

    await TestBed.configureTestingModule({
      imports: [
        MembersList,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        lucideIcons,
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: MembersStore, useValue: store },
        {
          provide: AuthService,
          useValue: { isAdmin: signal(false).asReadonly() },
        },
      ],
    })
      .overrideComponent(MembersList, { set: { providers: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(MembersList);
    await fixture.whenStable();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('passes AXE wcag2a/aa on the list view', async () => {
    await TestBed.configureTestingModule({
      imports: [
        MembersList,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        lucideIcons,
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: MembersStore, useValue: createStoreFake() },
        {
          provide: AuthService,
          useValue: { isAdmin: signal(true).asReadonly() },
        },
      ],
    })
      .overrideComponent(MembersList, { set: { providers: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(MembersList);
    await fixture.whenStable();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
