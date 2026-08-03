import { DatePipe } from '@angular/common';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslocoTestingModule } from '@jsverse/transloco';
import axe from 'axe-core';

import en from '../../../public/i18n/en.json';
import { ThrowingMissingKeyHandler } from '../core/i18n/missing-key-handler';
import { ToastService } from '../ui';
import { Reports } from './reports';
import { ReportsStore } from './reports.store';
import type {
  DeadStockRow,
  FineCollectionRow,
  GenreBreakdownRow,
  HighDemandRow,
  NewMemberGrowthRow,
  OverdueAgingRow,
  PeakHoursRow,
  RangeDays,
} from './reports.types';

/**
 * `downloadCsv` triggers a real anchor click via browser APIs; the Angular
 * unit-test builder disallows `vi.mock` for relative imports, so this
 * intercepts those APIs directly and reads back the Blob it built, instead
 * of mocking the module.
 */
function captureDownload() {
  const anchor = document.createElement('a');
  const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {});
  const originalCreateElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string) =>
    tag === 'a' ? anchor : originalCreateElement(tag),
  );
  let blob: Blob | undefined;
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: vi.fn((b: Blob) => {
      blob = b;
      return 'blob:mock-url';
    }),
    revokeObjectURL: vi.fn(),
  });
  return {
    anchor,
    clickSpy,
    filename: () => anchor.download,
    text: () => blob!.text(),
  };
}

const overdueRow: OverdueAgingRow = { bucket: '8-14', bucket_order: 2, loan_count: 3 };
const deadStockRow: DeadStockRow = {
  title_id: 't1',
  title: 'Dead Title',
  author: 'Author D',
  genre: 'Fiction',
  lendable_copies: 2,
};
const highDemandRow: HighDemandRow = {
  title_id: 't2',
  title: 'Hot Title',
  author: 'Author H',
  checkout_count: 5,
  waiting_holds: 2,
};
const fineCollectionRow: FineCollectionRow = {
  report_date: '2026-08-01',
  collected: 10,
  incurred: 15,
};
const memberGrowthRow: NewMemberGrowthRow = { report_date: '2026-08-01', member_count: 2 };
const peakHoursRow: PeakHoursRow = { hour_of_day: 9, checkout_count: 4 };
const genreRow: GenreBreakdownRow = { genre: 'Sci-fi', checkout_count: 6 };

describe('Reports', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  async function setup(storeOverrides: Record<string, unknown> = {}) {
    const rangeSig = signal<RangeDays>(14);
    const errorSig = signal<string | null>(null);

    const store = {
      range: rangeSig.asReadonly(),
      currency: signal('USD').asReadonly(),
      loading: signal(false).asReadonly(),
      error: errorSig.asReadonly(),
      overdueAging: signal<OverdueAgingRow[]>([overdueRow]).asReadonly(),
      deadStock: signal<DeadStockRow[]>([deadStockRow]).asReadonly(),
      highDemand: signal<HighDemandRow[]>([highDemandRow]).asReadonly(),
      fineCollection: signal<FineCollectionRow[]>([fineCollectionRow]).asReadonly(),
      newMemberGrowth: signal<NewMemberGrowthRow[]>([memberGrowthRow]).asReadonly(),
      peakHours: signal<PeakHoursRow[]>([peakHoursRow]).asReadonly(),
      genreBreakdown: signal<GenreBreakdownRow[]>([genreRow]).asReadonly(),
      totalOverdue: signal(3).asReadonly(),
      init: vi.fn().mockResolvedValue(undefined),
      setRange: vi.fn(async (range: RangeDays) => rangeSig.set(range)),
      ...storeOverrides,
      _rangeSig: rangeSig,
      _errorSig: errorSig,
    };

    const toast = { show: vi.fn(), error: vi.fn() };

    await TestBed.configureTestingModule({
      imports: [
        Reports,
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
        // Charts are covered by ui/echart.spec.ts in isolation; forcing the
        // server platform here keeps this test to Reports' own composition
        // and avoids driving real canvas init through seven chart instances.
        { provide: PLATFORM_ID, useValue: 'server' },
      ],
    })
      .overrideComponent(Reports, {
        set: { providers: [{ provide: ReportsStore, useValue: store }, DatePipe] },
      })
      .compileComponents();

    const fixture = TestBed.createComponent(Reports);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    return { fixture, store, toast, el: fixture.nativeElement as HTMLElement };
  }

  it('loads on init and renders the range selector at the store value', async () => {
    const { store, el } = await setup();

    expect(store.init).toHaveBeenCalled();
    const options = Array.from(el.querySelectorAll('[role="radio"]'));
    expect(options.map((o) => o.textContent?.trim())).toEqual(['7 days', '14 days', '30 days']);
    expect(el.textContent).toContain('Reports');
  });

  it('switches range on selector click and reloads', async () => {
    const { store, el } = await setup();

    const sevenDayOption = Array.from(el.querySelectorAll('[role="radio"]')).find((o) =>
      o.textContent?.includes('7 days'),
    ) as HTMLButtonElement;
    sevenDayOption.click();
    await Promise.resolve();

    expect(store.setRange).toHaveBeenCalledWith(7);
  });

  it('shows an alert and toasts when the store reports a load error', async () => {
    const { toast, el } = await setup({ error: signal('boom').asReadonly() });

    expect(el.querySelector('[role="alert"]')?.textContent).toContain("Couldn't load reports");
    expect(toast.error).toHaveBeenCalled();
  });

  it('renders dead stock and high demand as visible tables with their row data', async () => {
    const { el } = await setup();

    expect(el.textContent).toContain('Dead Title');
    expect(el.textContent).toContain('Author D');
    expect(el.textContent).toContain('Hot Title');
    expect(el.textContent).toContain('Author H');
  });

  it('shows the dead stock empty state when nothing is dead stock', async () => {
    const { el } = await setup({ deadStock: signal<DeadStockRow[]>([]).asReadonly() });

    expect(el.textContent).toContain('No dead stock');
  });

  it('renders a server-side placeholder instead of a live chart', async () => {
    const { el } = await setup();

    expect(el.querySelector('[echarts]')).toBeNull();
    expect(el.querySelectorAll('[aria-hidden="true"]').length).toBeGreaterThan(0);
  });

  it('every chart section carries an accessible data table with its numbers', async () => {
    const { el } = await setup();

    const tables = Array.from(el.querySelectorAll('table.sr-only'));
    // Overdue aging, fine collection, new member growth, peak hours, genre breakdown.
    expect(tables.length).toBe(5);
    expect(el.textContent).toContain('8–14 days');
    expect(el.textContent).toContain('9:00');
    expect(el.textContent).toContain('Sci-fi');
  });

  it('exports overdue aging as CSV matching the on-screen bucket data', async () => {
    const download = captureDownload();
    const { el } = await setup();

    const button = Array.from(el.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Export CSV'),
    ) as HTMLButtonElement;
    button.click();

    expect(download.filename()).toBe('overdue-aging.csv');
    expect(await download.text()).toContain('8–14 days,3');
    expect(download.clickSpy).toHaveBeenCalled();
  });

  it('exports dead stock as CSV named with the active range', async () => {
    const download = captureDownload();
    const { el } = await setup();

    const buttons = Array.from(el.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Export CSV'),
    );
    // Overdue aging is first; dead stock is second.
    (buttons[1] as HTMLButtonElement).click();

    expect(download.filename()).toBe('dead-stock-14-days.csv');
    expect(await download.text()).toContain('Dead Title,Author D,Fiction,2');
  });

  it('has no serious accessibility violations', async () => {
    const { fixture } = await setup();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
