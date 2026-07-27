import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  LUCIDE_ICONS,
  LucideIconProvider,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
} from 'lucide-angular';
import { TableColumn, TableSort, UiCellDef, UiTable, sortRows } from './table';
import { UiEmptyState } from './empty-state';

interface Book {
  id: number;
  title: string;
  status: string;
  copies: number;
}

const COLS: TableColumn<Book>[] = [
  { key: 'title', header: 'Title', width: '50%', sortable: true },
  { key: 'status', header: 'Status' },
  { key: 'copies', header: 'Copies', align: 'right', sortable: true },
];

const BOOKS: Book[] = [
  { id: 1, title: 'Dune', status: 'available', copies: 3 },
  { id: 2, title: '1984', status: 'on loan', copies: 0 },
];

@Component({
  imports: [UiTable, UiCellDef, UiEmptyState],
  template: `
    <ui-table
      [columns]="cols"
      [rows]="rows()"
      [rowKey]="byId"
      caption="Catalog"
      [selectable]="selectable()"
      [(selected)]="picked"
      [(sort)]="sort"
      [rowSelectLabel]="labelFor"
    >
      <ng-template uiCell="status" let-row>
        <em>{{ row.status.toUpperCase() }}</em>
      </ng-template>
      <ui-empty-state headline="No books match your filters." />
    </ui-table>
  `,
})
class Host {
  cols = COLS;
  rows = signal<Book[]>(BOOKS);
  selectable = signal(false);
  picked = signal<readonly unknown[]>([]);
  sort = signal<TableSort | null>(null);
  byId = (b: Book) => b.id;
  labelFor = (b: Book) => `Select ${b.title}`;
}

describe('UiTable', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Host],
      providers: [
        {
          provide: LUCIDE_ICONS,
          multi: true,
          useValue: new LucideIconProvider({ ChevronDown, ChevronUp, ChevronsUpDown }),
        },
      ],
    }).compileComponents();
  });

  it('renders headers, default cells, custom cell template and alignment', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const ths = el.querySelectorAll('thead th');
    expect(ths.length).toBe(3);
    expect(ths[0].getAttribute('scope')).toBe('col');
    expect((ths[0] as HTMLElement).style.width).toBe('50%');
    expect(ths[2].className).toContain('text-right');
    expect(el.textContent).toContain('Dune');
    expect(el.querySelector('em')?.textContent).toBe('AVAILABLE');
    expect(el.textContent).not.toContain('No books match');
  });

  it('names the table and its scrollable region for assistive tech', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('caption')?.textContent?.trim()).toBe('Catalog');
    const region = el.querySelector('[role="region"]') as HTMLElement;
    expect(region.getAttribute('aria-label')).toBe('Catalog');
    // A scrollable region unreachable by keyboard strands its overflow (WCAG 2.1.1).
    expect(region.getAttribute('tabindex')).toBe('0');
  });

  it('shows projected empty state when rows are empty', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.rows.set([]);
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No books match');
  });

  it('spans the empty state across the checkbox column too', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.selectable.set(true);
    fixture.componentInstance.rows.set([]);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('tbody td')?.getAttribute('colspan')).toBe('4');
  });

  describe('sorting', () => {
    it('cycles a sortable column asc -> desc -> unsorted and mirrors it in aria-sort', async () => {
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const host = fixture.componentInstance;
      const titleHeader = el.querySelectorAll('thead th')[0];
      const button = titleHeader.querySelector('button') as HTMLButtonElement;

      expect(titleHeader.getAttribute('aria-sort')).toBe('none');

      button.click();
      await fixture.whenStable();
      expect(host.sort()).toEqual({ key: 'title', direction: 'asc' });
      expect(titleHeader.getAttribute('aria-sort')).toBe('ascending');

      button.click();
      await fixture.whenStable();
      expect(host.sort()).toEqual({ key: 'title', direction: 'desc' });
      expect(titleHeader.getAttribute('aria-sort')).toBe('descending');

      button.click();
      await fixture.whenStable();
      expect(host.sort()).toBeNull();
      expect(titleHeader.getAttribute('aria-sort')).toBe('none');
    });

    it('starts a newly picked column at ascending instead of inheriting the old direction', async () => {
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const host = fixture.componentInstance;
      const buttons = el.querySelectorAll('thead button');
      (buttons[0] as HTMLButtonElement).click();
      (buttons[0] as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(host.sort()).toEqual({ key: 'title', direction: 'desc' });

      (buttons[1] as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(host.sort()).toEqual({ key: 'copies', direction: 'asc' });
    });

    it('gives non-sortable columns no sort control and no aria-sort', async () => {
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      const statusHeader = el.querySelectorAll('thead th')[1];
      expect(statusHeader.querySelector('button')).toBeNull();
      expect(statusHeader.getAttribute('aria-sort')).toBeNull();
    });

    it('does not reorder the rows it was handed', async () => {
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;
      (el.querySelector('thead button') as HTMLButtonElement).click();
      await fixture.whenStable();
      // '1984' would sort first; the view must still show the caller's order.
      expect(el.querySelectorAll('tbody td')[0].textContent?.trim()).toBe('Dune');
    });
  });

  describe('selection', () => {
    const checkboxes = (el: HTMLElement): HTMLInputElement[] =>
      Array.from(el.querySelectorAll('input[type="checkbox"]'));

    it('renders no checkbox column unless selectable', async () => {
      const fixture = TestBed.createComponent(Host);
      await fixture.whenStable();
      expect(checkboxes(fixture.nativeElement as HTMLElement).length).toBe(0);
    });

    it('toggles a row and labels each checkbox with the row it belongs to', async () => {
      const fixture = TestBed.createComponent(Host);
      const host = fixture.componentInstance;
      host.selectable.set(true);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;

      const [, firstRow] = checkboxes(el);
      expect(firstRow.getAttribute('aria-label')).toBe('Select Dune');

      firstRow.click();
      await fixture.whenStable();
      expect(host.picked()).toEqual([1]);

      firstRow.click();
      await fixture.whenStable();
      expect(host.picked()).toEqual([]);
    });

    it('drives the header checkbox from indeterminate to checked as rows are picked', async () => {
      const fixture = TestBed.createComponent(Host);
      const host = fixture.componentInstance;
      host.selectable.set(true);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;

      const [header, firstRow, secondRow] = checkboxes(el);
      expect(header.checked).toBe(false);
      expect(header.indeterminate).toBe(false);

      firstRow.click();
      await fixture.whenStable();
      expect(header.indeterminate).toBe(true);
      expect(header.checked).toBe(false);

      secondRow.click();
      await fixture.whenStable();
      expect(header.checked).toBe(true);
      expect(header.indeterminate).toBe(false);
    });

    it('select-all covers only the rendered rows, leaving off-page picks alone', async () => {
      const fixture = TestBed.createComponent(Host);
      const host = fixture.componentInstance;
      host.selectable.set(true);
      // 99 stands in for a row selected on a previous page and now unrendered.
      host.picked.set([99]);
      await fixture.whenStable();
      const el = fixture.nativeElement as HTMLElement;

      const [header] = checkboxes(el);
      header.click();
      await fixture.whenStable();
      expect([...host.picked()].sort()).toEqual([1, 2, 99]);

      header.click();
      await fixture.whenStable();
      expect(host.picked()).toEqual([99]);
    });
  });
});

describe('sortRows', () => {
  it('returns the input untouched with no sort', () => {
    expect(sortRows(BOOKS, null, COLS)).toBe(BOOKS);
  });

  it('sorts strings naturally in both directions', () => {
    const asc = sortRows(BOOKS, { key: 'title', direction: 'asc' }, COLS);
    expect(asc.map((b) => b.title)).toEqual(['1984', 'Dune']);
    const desc = sortRows(BOOKS, { key: 'title', direction: 'desc' }, COLS);
    expect(desc.map((b) => b.title)).toEqual(['Dune', '1984']);
  });

  it('compares numbers numerically rather than as strings', () => {
    const rows: Book[] = [
      { id: 1, title: 'a', status: '', copies: 10 },
      { id: 2, title: 'b', status: '', copies: 9 },
    ];
    const asc = sortRows(rows, { key: 'copies', direction: 'asc' }, COLS);
    expect(asc.map((r) => r.copies)).toEqual([9, 10]);
  });

  it('honours an explicit sortValue over the displayed text', () => {
    const cols: TableColumn<Book>[] = [
      { key: 'title', header: 'Title', sortable: true, sortValue: (b) => b.copies },
    ];
    const asc = sortRows(BOOKS, { key: 'title', direction: 'asc' }, cols);
    expect(asc.map((b) => b.title)).toEqual(['1984', 'Dune']);
  });

  it('leaves the caller array unmutated', () => {
    const rows = [...BOOKS];
    sortRows(rows, { key: 'title', direction: 'asc' }, COLS);
    expect(rows.map((b) => b.title)).toEqual(['Dune', '1984']);
  });

  it('ignores a sort key that matches no column', () => {
    expect(sortRows(BOOKS, { key: 'nope', direction: 'asc' }, COLS)).toBe(BOOKS);
  });

  /**
   * The headers only render a sort control for sortable columns and `ariaSort`
   * returns null for the rest, so honouring a non-sortable key would show
   * sorted data under headers that all report themselves unsorted. A `sort`
   * restored from a query param is the realistic way in.
   */
  it('ignores a column that is not marked sortable', () => {
    expect(sortRows(BOOKS, { key: 'status', direction: 'asc' }, COLS)).toBe(BOOKS);
  });
});
