import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslocoMissingHandler, TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';
import {
  ChevronLeft,
  ChevronRight,
  LUCIDE_ICONS,
  LucideIconProvider,
  X,
} from 'lucide-angular';

import { ThrowingMissingKeyHandler } from '../core/i18n';
import en from '../../../public/i18n/en.json';
import { AuditViewer } from './audit-viewer';
import { AuditStore } from './audit.store';
import type { AuditListItem } from './audit.types';

const sample: AuditListItem = {
  id: 'log1',
  actor: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002',
  action: 'member.create',
  entity_type: 'member',
  entity_id: 'm1',
  detail: { name: 'Ada Lovelace', card_barcode: 'MBR-ADA-1' },
  created_at: '2026-07-15T12:00:00Z',
  actor_profile: {
    id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002',
    full_name: 'Admin Member Test',
    email: 'admin@bookly.local',
  },
};

const lucideIcons = {
  provide: LUCIDE_ICONS,
  multi: true,
  useValue: new LucideIconProvider({ ChevronLeft, ChevronRight, X }),
};

function createStoreFake(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    rows: signal([sample]).asReadonly(),
    total: signal(1).asReadonly(),
    page: signal(1).asReadonly(),
    pageSize: 10,
    actorId: signal('all' as const).asReadonly(),
    action: signal('all' as const).asReadonly(),
    entityType: signal('all' as const).asReadonly(),
    fromDate: signal('').asReadonly(),
    toDate: signal('').asReadonly(),
    actors: signal([sample.actor_profile!]).asReadonly(),
    loading: signal(false).asReadonly(),
    error: signal<string | null>(null).asReadonly(),
    actorsError: signal<string | null>(null).asReadonly(),
    empty: signal(false).asReadonly(),
    hasActiveFilters: signal(false).asReadonly(),
    init: vi.fn().mockResolvedValue(undefined),
    setActorId: vi.fn(),
    setAction: vi.fn(),
    setEntityType: vi.fn(),
    setFromDate: vi.fn(),
    setToDate: vi.fn(),
    setPage: vi.fn(),
    clearFilters: vi.fn(),
    ...overrides,
  };
}

describe('AuditViewer', () => {
  it('renders localized action text and opens detail for a row', async () => {
    await TestBed.configureTestingModule({
      imports: [
        AuditViewer,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        lucideIcons,
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: AuditStore, useValue: createStoreFake() },
      ],
    })
      .overrideComponent(AuditViewer, { set: { providers: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(AuditViewer);
    await fixture.whenStable();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Member created');
    expect(text).toContain('Admin Member Test');

    const detailBtn = Array.from(
      (fixture.nativeElement as HTMLElement).querySelectorAll('button'),
    ).find((btn) => btn.textContent?.includes('View detail'));
    expect(detailBtn).toBeTruthy();
    detailBtn!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Ada Lovelace');
    expect(fixture.nativeElement.textContent).toContain('MBR-ADA-1');
  });

  it('renders the empty state when there are no audit rows', async () => {
    const store = createStoreFake({
      rows: signal([]).asReadonly(),
      total: signal(0).asReadonly(),
      empty: signal(true).asReadonly(),
    });

    await TestBed.configureTestingModule({
      imports: [
        AuditViewer,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        lucideIcons,
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: AuditStore, useValue: store },
      ],
    })
      .overrideComponent(AuditViewer, { set: { providers: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(AuditViewer);
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('No audit entries yet');
  });

  it('passes AXE wcag2a/aa on the empty state', async () => {
    const store = createStoreFake({
      rows: signal([]).asReadonly(),
      total: signal(0).asReadonly(),
      empty: signal(true).asReadonly(),
    });

    await TestBed.configureTestingModule({
      imports: [
        AuditViewer,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        lucideIcons,
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: AuditStore, useValue: store },
      ],
    })
      .overrideComponent(AuditViewer, { set: { providers: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(AuditViewer);
    await fixture.whenStable();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('passes AXE wcag2a/aa on the list view', async () => {
    await TestBed.configureTestingModule({
      imports: [
        AuditViewer,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        lucideIcons,
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        { provide: AuditStore, useValue: createStoreFake() },
      ],
    })
      .overrideComponent(AuditViewer, { set: { providers: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(AuditViewer);
    await fixture.whenStable();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
