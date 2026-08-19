import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
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

async function openAddMemberForm() {
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
      provideRouter([]),
      lucideIcons,
      provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
      { provide: MembersStore, useValue: createStoreFake() },
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
  const el = fixture.nativeElement as HTMLElement;
  const add = [...el.querySelectorAll('button')].find((b) =>
    b.textContent?.includes('Add member'),
  );
  add?.click();
  await fixture.whenStable();
  return { fixture, el };
}

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
    typesError: signal<string | null>(null).asReadonly(),
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
        provideRouter([]),
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
        provideRouter([]),
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
        provideRouter([]),
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
        provideRouter([]),
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

  it('does not keep letters in the add-member phone field', async () => {
    const { fixture, el } = await openAddMemberForm();

    const input = el.querySelector('input[type="tel"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const letter = new KeyboardEvent('keydown', { key: 'a', bubbles: true, cancelable: true });
    input.dispatchEvent(letter);
    expect(letter.defaultPrevented).toBe(true);

    input.value = '555-abc-0100';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(input.value).toBe('555--0100');
  });

  it('caps the add-member phone field at 14 characters', async () => {
    const { fixture, el } = await openAddMemberForm();

    const input = el.querySelector('input[type="tel"]') as HTMLInputElement;
    input.value = '12345678901234567890';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(input.value).toBe('12345678901234');
    expect(input.maxLength).toBe(14);
  });

  it('rejects an invalid add-member email and allows an empty one', async () => {
    const { fixture, el } = await openAddMemberForm();

    const input = el.querySelector('input[type="email"]') as HTMLInputElement;
    input.value = 'not-an-email';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await fixture.whenStable();
    expect(el.textContent).toContain('Enter a valid email address');
    expect(input.getAttribute('aria-invalid')).toBe('true');

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('blur', { bubbles: true }));
    await fixture.whenStable();
    expect(el.textContent).not.toContain('Enter a valid email address');
  });

  it('auto-assigns a unique MBR- card barcode when adding a member', async () => {
    const { el } = await openAddMemberForm();

    const input = el.querySelector('input.font-mono') as HTMLInputElement;
    expect(input.parentElement?.querySelector('span')?.textContent?.trim()).toBe('MBR-');
    expect(input.value).toMatch(/^[A-F0-9]{10}$/);
  });
});
