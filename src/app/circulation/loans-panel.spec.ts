import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';
import {
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  LUCIDE_ICONS,
  LucideIconProvider,
} from 'lucide-angular';

import en from '../../../public/i18n/en.json';
import { ThrowingMissingKeyHandler } from '../core/i18n/missing-key-handler';
import { ToastService } from '../ui';
import { LoansPanel } from './loans-panel';
import { LoansStore } from './loans.store';
import type { LoanListItem, LoansTab, OverdueLoan } from './circulation.types';

const activeLoan: LoanListItem = {
  id: 'l1',
  copy_id: 'c1',
  member_id: 'm1',
  checked_out_by: 'p1',
  checked_out_at: '2026-07-01T00:00:00Z',
  due_at: '2026-08-20T00:00:00Z',
  returned_at: null,
  renew_count: 0,
  status: 'active',
  created_at: '2026-07-01T00:00:00Z',
  copy: { id: 'c1', barcode: 'BK-100', title: 'Dune', author: 'Herbert' },
  member: { id: 'm1', name: 'Ada Lovelace', card_barcode: 'MBR-1' },
};

const overdueLoan: OverdueLoan = {
  loan_id: 'l2',
  copy_id: 'c2',
  copy_barcode: 'BK-200',
  title_id: 't2',
  title: 'Foundation',
  author: 'Asimov',
  member_id: 'm2',
  member_name: 'Grace Hopper',
  member_card_barcode: 'MBR-2',
  checked_out_at: '2026-06-01T00:00:00Z',
  due_at: '2026-06-22T00:00:00Z',
  days_late: 40,
  fine_rate_per_day: 0.25,
  projected_fine: 10,
};

describe('LoansPanel', () => {
  async function setup(storeOverrides: Record<string, unknown> = {}) {
    const tabSig = signal<LoansTab>('active');
    const loansSig = signal<LoanListItem[]>([]);
    const overdueSig = signal<OverdueLoan[]>([]);

    const store = {
      tab: tabSig.asReadonly(),
      loans: loansSig.asReadonly(),
      overdue: overdueSig.asReadonly(),
      total: signal(0).asReadonly(),
      page: signal(1).asReadonly(),
      pageSize: 10,
      loading: signal(false).asReadonly(),
      error: signal<string | null>(null).asReadonly(),
      empty: signal(false).asReadonly(),
      init: vi.fn().mockResolvedValue(undefined),
      setTab: vi.fn(async (tab: LoansTab) => tabSig.set(tab)),
      setPage: vi.fn().mockResolvedValue(undefined),
      ...storeOverrides,
      _tabSig: tabSig,
      _loansSig: loansSig,
      _overdueSig: overdueSig,
    };

    const toast = { show: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        LoansPanel,
        TranslocoTestingModule.forRoot({
          langs: { en },
          translocoConfig: { availableLangs: ['en'], defaultLang: 'en' },
          preloadLangs: true,
        }),
      ],
      providers: [
        provideRouter([]),
        ThrowingMissingKeyHandler,
        { provide: ToastService, useValue: toast },
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ ChevronsUpDown, ChevronLeft, ChevronRight }),
        },
      ],
    })
      .overrideComponent(LoansPanel, {
        set: { providers: [{ provide: LoansStore, useValue: store }] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(LoansPanel);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, store, toast };
  }

  it('renders active loans with member, title, and due date', async () => {
    const { fixture, store } = await setup();
    store._loansSig.set([activeLoan]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Dune');
    expect(text).toContain('BK-100');
    expect(store.init).toHaveBeenCalled();
  });

  it('switches to the overdue tab with days late and projected fine', async () => {
    const { fixture, store } = await setup();
    const host = fixture.nativeElement as HTMLElement;

    const overdueTab = [...host.querySelectorAll('[role="radio"]')].find((b) =>
      (b.textContent ?? '').trim().includes('Overdue'),
    ) as HTMLButtonElement;
    overdueTab.click();
    await fixture.whenStable();
    store._overdueSig.set([overdueLoan]);
    fixture.detectChanges();

    expect(store.setTab).toHaveBeenCalledWith('overdue');
    const text = host.textContent ?? '';
    expect(text).toContain('Grace Hopper');
    expect(text).toContain('Foundation');
    expect(text).toContain('40');
    expect(text).toContain('$10.00');
  });

  it('shows the returned timestamp column on the returned tab', async () => {
    const { fixture, store } = await setup();
    store._tabSig.set('returned');
    store._loansSig.set([
      { ...activeLoan, status: 'returned', returned_at: '2026-08-01T14:30:00Z' },
    ]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Returned');
    expect(text).toContain('Aug 1, 2026');
  });

  it('shows the empty state when a tab has no loans', async () => {
    const { fixture } = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No active loans');
  });

  it('has no serious accessibility violations', async () => {
    const { fixture, store } = await setup();
    store._loansSig.set([activeLoan]);
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
