import { DatePipe } from '@angular/common';
import { PLATFORM_ID, signal } from '@angular/core';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
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
/** Card order in the template, with the copy each card owns when it fails. */
const metricCards = [
  { metric: 'overdueAging', failureText: "Couldn't load overdue aging" },
  { metric: 'deadStock', failureText: "Couldn't load dead stock" },
  { metric: 'highDemand', failureText: "Couldn't load high demand" },
  { metric: 'fineCollection', failureText: "Couldn't load fine collection" },
  { metric: 'newMemberGrowth', failureText: "Couldn't load new member growth" },
  { metric: 'peakHours', failureText: "Couldn't load peak hours" },
  { metric: 'genreBreakdown', failureText: "Couldn't load genre breakdown" },
];

/** The page-level announcement, i.e. the status region outside every card. */
function pageStatus(el: HTMLElement): Element | undefined {
  return Array.from(el.querySelectorAll('[role="status"]')).find(
    (region) => !region.closest('ui-card'),
  );
}

async function selectRange(
  fixture: ComponentFixture<Reports>,
  el: HTMLElement,
  label: string,
): Promise<void> {
  const option = Array.from(el.querySelectorAll('[role="radio"]')).find((o) =>
    o.textContent?.includes(label),
  ) as HTMLButtonElement;
  option.click();
  await fixture.whenStable();
  fixture.detectChanges();
}

const noError = signal<string | null>(null).asReadonly();
const notPending = signal(false).asReadonly();
const notLoading = signal(false).asReadonly();
const isPending = signal(true).asReadonly();
/** A cold open: no metric has produced a result yet. */
const everyMetricPending = Object.fromEntries(
  metricCards.map(({ metric }) => [`${metric}Pending`, isPending]),
);

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
      overdueAgingError: noError,
      deadStockError: noError,
      highDemandError: noError,
      fineCollectionError: noError,
      newMemberGrowthError: noError,
      peakHoursError: noError,
      genreBreakdownError: noError,
      overdueAgingPending: notPending,
      deadStockPending: notPending,
      highDemandPending: notPending,
      fineCollectionPending: notPending,
      newMemberGrowthPending: notPending,
      peakHoursPending: notPending,
      genreBreakdownPending: notPending,
      overdueAgingLoading: notLoading,
      deadStockLoading: notLoading,
      highDemandLoading: notLoading,
      fineCollectionLoading: notLoading,
      newMemberGrowthLoading: notLoading,
      peakHoursLoading: notLoading,
      genreBreakdownLoading: notLoading,
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

  it('ignores a range change with a value outside 7/14/30', async () => {
    const { store, fixture } = await setup();

    // ui-segmented only ever emits its own option values, but the handler
    // still guards against a tampered/unexpected DOM event value.
    await (
      fixture.componentInstance as unknown as { onRangeChange(v?: string): Promise<void> }
    ).onRangeChange('15');

    expect(store.setRange).not.toHaveBeenCalled();
  });

  it('toasts once when any metric fails to load', async () => {
    const { toast } = await setup({ error: signal('boom').asReadonly() });

    expect(toast.error).toHaveBeenCalled();
  });

  it.each(metricCards)(
    '$metric names itself in its own card error rather than blaming reports at large',
    async ({ metric, failureText }) => {
      const { el } = await setup({
        error: signal('boom').asReadonly(),
        [`${metric}Error`]: signal('boom').asReadonly(),
      });

      const message = Array.from(el.querySelectorAll('ui-card [role="status"]')).find((region) =>
        region.textContent?.includes("Couldn't load"),
      );
      expect(message?.textContent).toContain(failureText);
      // The copy is on screen for sighted staff, not only announced.
      expect(message?.classList.contains('sr-only')).toBe(false);
    },
  );

  it("keeps every card's status region mounted before it has anything to announce", async () => {
    const { el } = await setup();

    // A live region inserted already populated is announced unreliably, so
    // each card registers its region up front and only its text changes.
    const regions = Array.from(el.querySelectorAll('ui-card [role="status"]'));
    expect(regions).toHaveLength(7);
    expect(regions.map((region) => region.textContent?.trim())).toEqual(Array(7).fill(''));
  });

  it('keeps a total outage to one assertive announcement', async () => {
    const allFailed = Object.fromEntries(
      metricCards.map(({ metric }) => [`${metric}Error`, signal('boom').asReadonly()]),
    );
    const { el, toast } = await setup({ error: signal('boom').asReadonly(), ...allFailed });

    // Seven cards failing together must not queue seven interruptions; the
    // cards state their own failure politely and the page toast is the one
    // assertive announcement.
    expect(el.querySelectorAll('[role="alert"]')).toHaveLength(0);
    const messages = Array.from(el.querySelectorAll('ui-card [role="status"]'));
    expect(messages).toHaveLength(7);
    expect(messages.every((region) => region.getAttribute('aria-live') === 'polite')).toBe(true);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it('shows a failed table metric as a card-local error, never as an empty state', async () => {
    const { el } = await setup({
      error: signal('boom').asReadonly(),
      deadStockError: signal('boom').asReadonly(),
      deadStock: signal<DeadStockRow[]>([]).asReadonly(),
    });

    expect(el.textContent).toContain("Couldn't load dead stock");
    expect(el.textContent).not.toContain('No dead stock');
    // The metrics that did load stay on screen.
    expect(el.textContent).toContain('Hot Title');
    expect(el.textContent).toContain('Sci-fi');
  });

  it('shows a still-loading metric as a labelled skeleton, inserting no live region', async () => {
    const { el } = await setup({
      deadStockPending: signal(true).asReadonly(),
      deadStock: signal<DeadStockRow[]>([]).asReadonly(),
    });

    const card = el.querySelectorAll('ui-card')[1] as HTMLElement;
    // The page-level region announces the load; this card's own region stays
    // mounted and empty, holding nothing until the metric fails.
    expect(card.querySelector('[role="status"]')?.textContent?.trim()).toBe('');

    const placeholder = card.querySelector('ui-skeleton')?.parentElement as HTMLElement;
    expect(placeholder.getAttribute('role')).toBeNull();
    expect(placeholder.getAttribute('aria-live')).toBeNull();
    // The label is for assistive tech only; sighted users get the skeleton.
    expect(placeholder.querySelector('.sr-only')?.textContent).toContain('Loading report');
  });

  it('holds a metric card back from claiming empty data before its first load settles', async () => {
    const { el } = await setup({
      deadStockPending: signal(true).asReadonly(),
      deadStock: signal<DeadStockRow[]>([]).asReadonly(),
      peakHoursPending: signal(true).asReadonly(),
      peakHours: signal<PeakHoursRow[]>([]).asReadonly(),
    });

    expect(el.textContent).not.toContain('No dead stock');
    expect(el.querySelectorAll('ui-skeleton')).toHaveLength(2);
    // A pending chart renders no zeroed data table either.
    expect(el.querySelectorAll('table.sr-only')).toHaveLength(4);
    // Cards that already have their data are untouched.
    expect(el.textContent).toContain('Hot Title');
  });

  it('reserves the chart box while a chart metric is still loading', async () => {
    const { el } = await setup({
      peakHoursPending: signal(true).asReadonly(),
      peakHours: signal<PeakHoursRow[]>([]).asReadonly(),
    });

    const cards = Array.from(el.querySelectorAll('ui-card'));
    const pendingBar = cards[5]?.querySelector('ui-skeleton span') as HTMLElement;
    const settledChart = cards[6]?.querySelector('ui-echart div') as HTMLElement;

    // The placeholder stands in for the chart, so the card must not resize
    // under the reader when the numbers arrive.
    expect(pendingBar.style.height).not.toBe('');
    expect(pendingBar.style.height).toBe(settledChart.style.height);
  });

  it('shows a failed chart metric as a card-local error, never as a zeroed chart table', async () => {
    const { el } = await setup({
      error: signal('boom').asReadonly(),
      peakHoursError: signal('boom').asReadonly(),
      peakHours: signal<PeakHoursRow[]>([]).asReadonly(),
    });

    expect(el.querySelectorAll('table.sr-only')).toHaveLength(4);
    expect(el.textContent).not.toContain('9:00');
    expect(el.textContent).toContain('Dead Title');
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

  it('announces the first load as a load, not as a refresh of numbers on screen', async () => {
    const { el } = await setup({ loading: signal(true).asReadonly() });

    // Nothing has been shown yet, so there is nothing to call a refresh.
    expect(pageStatus(el)?.textContent?.trim()).toBe('Loading report');
  });

  it('still announces a load when the range changes before the first result arrives', async () => {
    const { el, fixture } = await setup({
      loading: signal(true).asReadonly(),
      ...everyMetricPending,
    });

    await selectRange(fixture, el, '7 days');

    // Switching range mid-first-load does not conjure numbers to refresh.
    expect(pageStatus(el)?.textContent?.trim()).toBe('Loading report');
  });

  it('announces a range change as a refresh, since the previous rows stay up', async () => {
    const { el, fixture } = await setup({ loading: signal(true).asReadonly() });

    await selectRange(fixture, el, '7 days');

    expect(pageStatus(el)?.textContent?.trim()).toBe('Updating reports for the new range');
  });

  it('marks a card busy and announces the refresh while it re-reads the new range', async () => {
    // The store keeps the previous range's rows on screen while the new read
    // runs, so without a busy cue the card shows 14-day numbers under a
    // 30-day heading with nothing to say so.
    const { el, fixture } = await setup({
      loading: signal(true).asReadonly(),
      deadStockLoading: signal(true).asReadonly(),
    });
    await selectRange(fixture, el, '30 days');

    const cards = Array.from(el.querySelectorAll('ui-card'));
    expect(cards[1]?.getAttribute('aria-busy')).toBe('true');
    expect(cards[1]?.classList.contains('opacity-60')).toBe(true);
    // The retained rows stay visible; this is a refresh, not a first load.
    expect(el.textContent).toContain('Dead Title');
    // A card whose own read already settled is neither busy nor dimmed.
    expect(cards[2]?.getAttribute('aria-busy')).toBe('false');
    expect(cards[2]?.classList.contains('opacity-60')).toBe(false);

    expect(pageStatus(el)?.textContent?.trim()).toBe('Updating reports for the new range');
  });

  it('leaves the page announcement empty once every metric has settled', async () => {
    const { el } = await setup();

    // The region stays in the DOM so assistive tech has it registered before
    // the text arrives; only its content clears.
    expect(pageStatus(el)).not.toBeUndefined();
    expect(pageStatus(el)?.textContent?.trim()).toBe('');
  });

  it('refuses to export a metric that is pending or failed', async () => {
    const download = captureDownload();
    const { el } = await setup({
      error: signal('boom').asReadonly(),
      deadStockPending: signal(true).asReadonly(),
      deadStock: signal<DeadStockRow[]>([]).asReadonly(),
      peakHoursError: signal('boom').asReadonly(),
      peakHours: signal<PeakHoursRow[]>([]).asReadonly(),
    });

    // Card order: overdue aging, dead stock, high demand, fine collection,
    // new member growth, peak hours, genre breakdown.
    const exports = Array.from(el.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Export CSV'),
    ) as HTMLButtonElement[];

    expect(exports[1]?.disabled).toBe(true);
    expect(exports[5]?.disabled).toBe(true);
    expect(exports[0]?.disabled).toBe(false);

    // Both signals read empty, so an enabled button would hand the user a
    // header-only CSV that reads as a legitimate "no data" answer.
    exports[1]?.click();
    exports[5]?.click();
    expect(download.clickSpy).not.toHaveBeenCalled();
  });

  it('refuses to export a metric while its own read is in flight', async () => {
    const download = captureDownload();
    const { el } = await setup({
      loading: signal(true).asReadonly(),
      deadStockLoading: signal(true).asReadonly(),
    });

    const exports = Array.from(el.querySelectorAll('button')).filter((b) =>
      b.textContent?.includes('Export CSV'),
    ) as HTMLButtonElement[];

    // Dead stock still shows the previous range's rows while the new range
    // reads; exporting now writes those rows to a file named for the range
    // they do not belong to.
    expect(exports[1]?.disabled).toBe(true);
    exports[1]?.click();
    expect(download.clickSpy).not.toHaveBeenCalled();

    // A metric whose own read already settled still exports.
    expect(exports[2]?.disabled).toBe(false);
  });

  it('has no serious accessibility violations', async () => {
    const { fixture } = await setup();

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no serious accessibility violations while a metric is still loading', async () => {
    const { fixture } = await setup({
      deadStockPending: signal(true).asReadonly(),
      deadStock: signal<DeadStockRow[]>([]).asReadonly(),
    });

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });

  it('has no serious accessibility violations once a metric has failed', async () => {
    const { fixture } = await setup({
      error: signal('boom').asReadonly(),
      deadStockError: signal('boom').asReadonly(),
      deadStock: signal<DeadStockRow[]>([]).asReadonly(),
    });

    const results = await axe.run(fixture.nativeElement as HTMLElement, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
    });
    expect(results.violations).toEqual([]);
  });
});
