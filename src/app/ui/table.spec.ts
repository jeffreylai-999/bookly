import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TableColumn, UiCellDef, UiTable } from './table';
import { UiEmptyState } from './empty-state';

interface Book {
  id: number;
  title: string;
  status: string;
  copies: number;
}

@Component({
  imports: [UiTable, UiCellDef, UiEmptyState],
  template: `
    <ui-table [columns]="cols" [rows]="rows" [rowKey]="byId">
      <ng-template uiCell="status" let-row>
        <em>{{ row.status.toUpperCase() }}</em>
      </ng-template>
      <ui-empty-state headline="No books match your filters." />
    </ui-table>
  `,
})
class Host {
  cols: TableColumn<Book>[] = [
    { key: 'title', header: 'Title', width: '50%' },
    { key: 'status', header: 'Status' },
    { key: 'copies', header: 'Copies', align: 'right' },
  ];
  rows: Book[] = [
    { id: 1, title: 'Dune', status: 'available', copies: 3 },
    { id: 2, title: '1984', status: 'on loan', copies: 0 },
  ];
  byId = (b: Book) => b.id;
}

describe('UiTable', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  });

  it('renders headers, default cells, custom cell template and alignment', async () => {
    const fixture = TestBed.createComponent(Host);
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    const ths = el.querySelectorAll('th');
    expect(ths.length).toBe(3);
    expect(ths[0].getAttribute('scope')).toBe('col');
    expect(ths[0].style.width).toBe('50%');
    expect(ths[2].className).toContain('text-right');
    expect(el.textContent).toContain('Dune');
    expect(el.querySelector('em')?.textContent).toBe('AVAILABLE');
    expect(el.textContent).not.toContain('No books match');
  });

  it('shows projected empty state when rows are empty', async () => {
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.rows = [];
    await fixture.whenStable();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('No books match');
  });
});
