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
import { FinesList } from './fines-list';
import { FinesStore } from './fines.store';
import type { FineListItem, FineStatusFilter } from './fines.types';

const fine: FineListItem = {
  id: 'f1',
  member_id: 'm1',
  loan_id: 'l1',
  amount: 10,
  amount_paid: 4,
  reason: 'damaged',
  status: 'partial',
  accrual_rule_snapshot: { charged_amount: 10 },
  created_at: '2026-08-01T10:00:00Z',
  member: { id: 'm1', name: 'Ada Lovelace', card_barcode: 'MBR-1' },
};

describe('FinesList', () => {
  async function setup(storeOverrides: Record<string, unknown> = {}) {
    const rowsSig = signal<FineListItem[]>([]);
    const filterSig = signal<FineStatusFilter>('all');

    const store = {
      rows: rowsSig.asReadonly(),
      total: signal(0).asReadonly(),
      page: signal(1).asReadonly(),
      pageSize: 10,
      statusFilter: filterSig.asReadonly(),
      loading: signal(false).asReadonly(),
      error: signal<string | null>(null).asReadonly(),
      currency: signal('USD').asReadonly(),
      empty: signal(false).asReadonly(),
      init: vi.fn().mockResolvedValue(undefined),
      setStatusFilter: vi.fn(async (status: FineStatusFilter) => filterSig.set(status)),
      setPage: vi.fn().mockResolvedValue(undefined),
      ...storeOverrides,
      _rowsSig: rowsSig,
      _filterSig: filterSig,
    };

    const toast = { show: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        FinesList,
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
      .overrideComponent(FinesList, {
        set: { providers: [{ provide: FinesStore, useValue: store }] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(FinesList);
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, store, toast };
  }

  it('lists fines with reason, amounts, balance, and status', async () => {
    const { fixture, store } = await setup();
    store._rowsSig.set([fine]);
    fixture.detectChanges();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Ada Lovelace');
    expect(text).toContain('Damaged');
    expect(text).toContain('$10.00');
    expect(text).toContain('$4.00');
    expect(text).toContain('$6.00');
    expect(text).toContain('Partial');
    expect(store.init).toHaveBeenCalled();
  });

  it('filters by status', async () => {
    const { fixture, store } = await setup();
    const host = fixture.nativeElement as HTMLElement;

    const outstanding = [...host.querySelectorAll('[role="radio"]')].find((b) =>
      (b.textContent ?? '').trim().includes('Outstanding'),
    ) as HTMLButtonElement;
    outstanding.click();
    await fixture.whenStable();

    expect(store.setStatusFilter).toHaveBeenCalledWith('outstanding');
  });

  it('shows the empty state when there are no fines', async () => {
    const { fixture } = await setup();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('No fines yet');
  });

  it('has no serious accessibility violations', async () => {
    const { fixture, store } = await setup();
    store._rowsSig.set([fine]);
    fixture.detectChanges();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
