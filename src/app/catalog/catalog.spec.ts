import { TestBed } from '@angular/core/testing';
import { provideTranslocoMissingHandler, TranslocoTestingModule } from '@jsverse/transloco';
import {
  ChevronLeft,
  ChevronRight,
  LUCIDE_ICONS,
  LucideIconProvider,
  Plus,
  Search,
  X,
} from 'lucide-angular';
import axe from 'axe-core';
import { signal } from '@angular/core';

import { AuthService } from '../core/auth';
import { ThrowingMissingKeyHandler } from '../core/i18n';
import { ToastService } from '../ui';
import en from '../../../public/i18n/en.json';
import { Catalog } from './catalog';
import { CatalogStore } from './catalog.store';
import type { CatalogTitle } from './catalog.types';

const dune: CatalogTitle = {
  id: 't1',
  title: 'Dune',
  author: 'Herbert',
  genre: 'Sci-fi',
  isbn: '9780441172719',
  description: null,
  replacement_cost: 20,
  created_at: '2026-01-01T00:00:00Z',
  copies: [{ id: 'c1', barcode: 'BK-001', status: 'available' }],
  availableCount: 1,
  totalCount: 1,
};

describe('Catalog', () => {
  beforeEach(async () => {
    const rows = signal<CatalogTitle[]>([]);
    const total = signal(0);
    const search = signal('');
    const genre = signal('');
    const genres = signal<string[]>(['Sci-fi']);
    const loading = signal(false);
    const error = signal<string | null>(null);
    const hasActiveFilters = signal(false);
    const isEmpty = signal(true);
    const page = signal(1);
    const pageSize = signal(10);

    await TestBed.configureTestingModule({
      imports: [
        Catalog,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideTranslocoMissingHandler(ThrowingMissingKeyHandler),
        ToastService,
        {
          provide: AuthService,
          useValue: { isAdmin: () => false },
        },
        {
          provide: CatalogStore,
          useValue: {
            rows,
            total,
            search,
            genre,
            genres,
            loading,
            error,
            hasActiveFilters,
            isEmpty,
            page,
            pageSize,
            load: async () => undefined,
            applySearch: async () => undefined,
            applyGenre: async () => undefined,
            applyPage: async () => undefined,
            clearFilters: async () => undefined,
            addTitle: async () => ({ ok: true }),
            editCopy: async () => ({ ok: true }),
            setCopyStatus: async () => ({ ok: true }),
          },
        },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ Plus, Search, X, ChevronLeft, ChevronRight }),
        },
      ],
    }).compileComponents();
  });

  it('shows an empty state with a clear path to add a title', async () => {
    const fixture = TestBed.createComponent(Catalog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('No titles yet');
    expect(el.textContent).toContain('Add title');
  });

  it('shows clear-filters when filters are active and empty', async () => {
    const store = TestBed.inject(CatalogStore) as unknown as {
      hasActiveFilters: ReturnType<typeof signal<boolean>>;
      isEmpty: ReturnType<typeof signal<boolean>>;
    };
    store.hasActiveFilters.set(true);
    store.isEmpty.set(true);

    const fixture = TestBed.createComponent(Catalog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('No titles match');
    expect(el.textContent).toContain('Clear filters');
  });

  it('renders the catalog table when titles exist', async () => {
    const store = TestBed.inject(CatalogStore) as unknown as {
      rows: ReturnType<typeof signal<CatalogTitle[]>>;
      total: ReturnType<typeof signal<number>>;
      isEmpty: ReturnType<typeof signal<boolean>>;
    };
    store.rows.set([dune]);
    store.total.set(1);
    store.isEmpty.set(false);

    const fixture = TestBed.createComponent(Catalog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Dune');
    expect(el.textContent).toContain('Herbert');
    expect(el.textContent).toContain('1 / 1');
  });

  it('has no serious AXE violations on the empty catalog', async () => {
    const fixture = TestBed.createComponent(Catalog);
    await fixture.whenStable();
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no serious AXE violations with a populated table', async () => {
    const store = TestBed.inject(CatalogStore) as unknown as {
      rows: ReturnType<typeof signal<CatalogTitle[]>>;
      total: ReturnType<typeof signal<number>>;
      isEmpty: ReturnType<typeof signal<boolean>>;
    };
    store.rows.set([dune]);
    store.total.set(1);
    store.isEmpty.set(false);

    const fixture = TestBed.createComponent(Catalog);
    await fixture.whenStable();
    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('keeps number of copies at 1 or more while typing', async () => {
    const fixture = TestBed.createComponent(Catalog);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const add = [...el.querySelectorAll('button')].find((b) => b.textContent?.includes('Add title'));
    add?.click();
    await fixture.whenStable();

    const input = el.querySelector('input[type="number"]') as HTMLInputElement;
    expect(input).toBeTruthy();

    const minus = new KeyboardEvent('keydown', { key: '-', bubbles: true, cancelable: true });
    input.dispatchEvent(minus);
    expect(minus.defaultPrevented).toBe(true);

    input.value = '-3';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await fixture.whenStable();
    expect(input.value).toBe('1');
  });
});
