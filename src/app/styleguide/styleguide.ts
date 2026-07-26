import { Component, computed, inject, signal } from '@angular/core';
import {
  BarPoint,
  SegmentedOption,
  SelectOption,
  TableColumn,
  TableSort,
  ToastService,
  UiAvatar,
  UiBadge,
  UiBarChart,
  UiBtn,
  UiCard,
  UiCellDef,
  UiDialog,
  UiEmptyState,
  UiField,
  UiKpiCard,
  UiLayout,
  UiListItem,
  UiPagination,
  UiProgress,
  UiSearchInput,
  UiSegmented,
  UiSelect,
  UiSidebarNavItem,
  UiSkeleton,
  UiTable,
  UiToastHost,
  UiTopbar,
  sortRows,
} from '../ui';

interface DemoLoan {
  id: number;
  title: string;
  member: string;
  status: 'success' | 'warning' | 'danger' | 'info';
  statusLabel: string;
  due: string;
}

@Component({
  selector: 'app-styleguide',
  imports: [
    UiAvatar,
    UiBadge,
    UiBarChart,
    UiBtn,
    UiCard,
    UiCellDef,
    UiDialog,
    UiEmptyState,
    UiField,
    UiKpiCard,
    UiLayout,
    UiListItem,
    UiPagination,
    UiProgress,
    UiSearchInput,
    UiSegmented,
    UiSelect,
    UiSidebarNavItem,
    UiSkeleton,
    UiTable,
    UiToastHost,
    UiTopbar,
  ],
  template: `
    <ui-layout>
      <div layout-sidebar class="flex flex-col gap-1">
        <div class="mb-6 px-3 text-[17px] font-extrabold tracking-[-0.01em] text-white">Bookly</div>
        <ui-sidebar-nav-item icon="layout-dashboard" label="Overview" [active]="true" />
        <ui-sidebar-nav-item icon="book-open" label="Catalog" />
        <ui-sidebar-nav-item icon="users" label="Members" />
        <ui-sidebar-nav-item icon="repeat" label="Circulation" />
        <ui-sidebar-nav-item icon="hand" label="Holds" />
        <ui-sidebar-nav-item icon="banknote" label="Fines" />
        <ui-sidebar-nav-item icon="bar-chart-3" label="Reports" />
        <ui-sidebar-nav-item icon="settings" label="Settings" />
      </div>

      <ui-topbar pageTitle="Styleguide" subtitle="Every kit component, all variants">
        <button uiBtn variant="outline">Outline</button>
        <button uiBtn (click)="toast.show('Primary action fired')">Primary action</button>
      </ui-topbar>

      <div class="flex flex-col gap-6">
        <div class="grid grid-cols-4 gap-5">
          <ui-kpi-card
            label="Books on loan"
            [value]="342"
            delta="12% vs yesterday"
            deltaTone="good"
            [hero]="true"
          />
          <ui-kpi-card label="Overdue" [value]="18" delta="3 more than last week" deltaTone="bad" />
          <ui-kpi-card
            label="Holds waiting"
            [value]="27"
            delta="2 new since yesterday"
            deltaTone="neutral"
          />
          <ui-kpi-card label="Fines outstanding" [value]="'$412.50'" />
        </div>

        <ui-card title="Badges" subtitle="Semantic tones — pick by meaning">
          <div class="flex flex-wrap gap-2">
            <span uiBadge tone="success">Available</span>
            <span uiBadge tone="warning">Due soon</span>
            <span uiBadge tone="danger">Overdue</span>
            <span uiBadge tone="info">On loan</span>
            <span uiBadge tone="neutral">Returned</span>
            <span uiBadge tone="pink">Non-fiction</span>
            <span uiBadge tone="purple">Staff</span>
          </div>
        </ui-card>

        <ui-card title="Buttons">
          <div class="flex flex-wrap items-center gap-3">
            <button uiBtn>Primary</button>
            <button uiBtn variant="outline">Outline</button>
            <button uiBtn variant="pill">Record payment</button>
            <button uiBtn variant="pill-muted">Waive</button>
            <button uiBtn variant="icon" aria-label="Notifications">🔔</button>
            <button uiBtn [disabled]="true">Disabled</button>
          </div>
        </ui-card>

        <ui-card title="Controls">
          <div class="flex flex-col gap-4">
            <ui-segmented [options]="tabs" [(value)]="tab" groupLabel="Loan status" />
            <div class="flex items-center gap-3">
              <ui-search-input
                class="w-72"
                placeholder="Search titles, authors, ISBN"
                [(value)]="query"
              />
              <ui-select
                class="w-52"
                [options]="statusFilters"
                [(value)]="statusFilter"
                ariaLabel="Filter by status"
              />
              <span class="text-[13px] text-ink-muted">{{
                query() ? 'Filtering: ' + query() : 'No filter'
              }}</span>
            </div>
            <div class="flex items-center gap-3">
              <ui-search-input
                class="w-72"
                [scan]="true"
                placeholder="Scan a barcode"
                (submitted)="toast.show('Scanned ' + $event)"
              />
              <span class="text-[13px] text-ink-muted">Scan mode — Enter submits and clears</span>
            </div>
            <ui-field label="Title" hint="As printed on the spine" #titleField>
              <input
                class="w-72 rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
                [id]="titleField.controlId"
                [attr.aria-describedby]="titleField.describedBy()"
              />
            </ui-field>
          </div>
        </ui-card>

        <ui-card title="Loading">
          <ui-skeleton [rows]="4" />
        </ui-card>

        @if (selected().length) {
          <div class="flex items-center gap-3 rounded-card border border-line bg-surface px-6 py-3">
            <span class="text-[13px] font-semibold text-ink">{{ selected().length }} selected</span>
            <button
              uiBtn
              variant="pill"
              (click)="toast.show(selected().length + ' items checked in')"
            >
              Check in
            </button>
            <button uiBtn variant="pill-muted" (click)="selected.set([])">Clear</button>
          </div>
        }

        <ui-table
          caption="Loans"
          [columns]="cols"
          [rows]="pagedLoans()"
          [rowKey]="loanKey"
          [selectable]="true"
          [(selected)]="selected"
          [(sort)]="sort"
          [rowSelectLabel]="loanSelectLabel"
          minWidth="52rem"
        >
          <ng-template uiCell="member" let-row>
            <span class="flex items-center gap-2.5">
              <ui-avatar [name]="row.member" [size]="28" />
              {{ row.member }}
            </span>
          </ng-template>
          <ng-template uiCell="status" let-row>
            <span uiBadge [tone]="row.status">{{ row.statusLabel }}</span>
          </ng-template>
          <ui-empty-state
            headline="No loans match your filters."
            message="Try clearing the search."
          />
        </ui-table>
        <ui-pagination [(page)]="page" [pageSize]="3" [total]="loans.length" />

        <div class="grid grid-cols-2 gap-5">
          <ui-card title="Checkouts this week">
            <ui-bar-chart [series]="chart" chartLabel="Checkouts per day this week" />
          </ui-card>
          <ui-card title="Collection by genre">
            <div class="flex flex-col gap-4">
              <ui-progress [value]="64" label="Fiction" valueLabel="64%" />
              <ui-progress [value]="22" label="Non-fiction" valueLabel="22%" color="cyan" />
              <ui-progress [value]="9" label="Children's" valueLabel="9%" color="purple" />
              <ui-progress [value]="5" label="Sci-fi" valueLabel="5%" color="amber" />
            </div>
          </ui-card>
        </div>

        <div class="grid grid-cols-2 gap-5">
          <ui-card title="Holds ready">
            <div class="flex flex-col gap-4">
              <ui-list-item
                icon="check-circle-2"
                iconTone="success"
                title="The Left Hand of Darkness"
                meta="Maya Chen · ready for pickup"
              />
              <ui-list-item
                icon="clock"
                iconTone="warning"
                title="Project Hail Mary"
                meta="Dev Patel · due tomorrow"
              >
                <span uiBadge tone="danger">2 days</span>
              </ui-list-item>
              <ui-list-item
                icon="alert-circle"
                iconTone="danger"
                title="Snow Crash"
                meta="Sam Ortiz · 6 days overdue"
              />
            </div>
          </ui-card>
          <ui-card title="Empty state">
            <ui-empty-state headline="Nothing overdue — nice." message="All loans are on schedule.">
              <button uiBtn variant="pill-muted">Clear filters</button>
            </ui-empty-state>
          </ui-card>
        </div>

        <ui-card title="Dialog & error toast">
          <div class="flex flex-wrap items-center gap-3">
            <button uiBtn (click)="dialogOpen.set(true)">Add title</button>
            <button uiBtn variant="pill-muted" (click)="toast.error('Barcode not recognised')">
              Raise an error
            </button>
          </div>
        </ui-card>
      </div>

      <ui-dialog [(open)]="dialogOpen" heading="Add title" subtitle="Catalog a new item">
        <ui-field label="ISBN" hint="13 digits, no dashes" #isbnField>
          <input
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
            [id]="isbnField.controlId"
            [attr.aria-describedby]="isbnField.describedBy()"
          />
        </ui-field>
        <button dialog-actions uiBtn variant="pill-muted" (click)="dialogOpen.set(false)">
          Cancel
        </button>
        <button dialog-actions uiBtn variant="pill" (click)="saveTitle()">Save</button>
      </ui-dialog>

      <ui-toast-host />
    </ui-layout>
  `,
})
export class Styleguide {
  protected readonly toast = inject(ToastService);
  protected readonly query = signal('');
  protected readonly tab = signal('active');
  protected readonly page = signal(1);
  protected readonly statusFilter = signal('');
  protected readonly selected = signal<readonly unknown[]>([]);
  protected readonly sort = signal<TableSort | null>(null);
  protected readonly dialogOpen = signal(false);
  protected readonly tabs: SegmentedOption[] = [
    { label: 'Active', value: 'active' },
    { label: 'Overdue', value: 'overdue' },
    { label: 'Returned', value: 'returned' },
  ];
  protected readonly statusFilters: SelectOption[] = [
    { label: 'All statuses', value: 'all' },
    { label: 'On loan', value: 'loan' },
    { label: 'Overdue', value: 'overdue' },
  ];
  protected readonly cols: TableColumn<DemoLoan>[] = [
    { key: 'title', header: 'Title', width: '35%', sortable: true },
    { key: 'member', header: 'Member', width: '30%', sortable: true },
    { key: 'status', header: 'Status' },
    { key: 'due', header: 'Due', align: 'right' },
  ];
  protected readonly loans: DemoLoan[] = [
    {
      id: 1,
      title: 'Dune',
      member: 'Maya Chen',
      status: 'info',
      statusLabel: 'On loan',
      due: 'Jul 28, 2026',
    },
    {
      id: 2,
      title: '1984',
      member: 'Dev Patel',
      status: 'warning',
      statusLabel: 'Due soon',
      due: 'Jul 26, 2026',
    },
    {
      id: 3,
      title: 'Snow Crash',
      member: 'Sam Ortiz',
      status: 'danger',
      statusLabel: 'Overdue',
      due: 'Jul 19, 2026',
    },
    {
      id: 4,
      title: 'The Dispossessed',
      member: 'Ana Silva',
      status: 'success',
      statusLabel: 'Returned',
      due: 'Jul 22, 2026',
    },
    {
      id: 5,
      title: 'Hyperion',
      member: 'Liu Wei',
      status: 'info',
      statusLabel: 'On loan',
      due: 'Aug 2, 2026',
    },
  ];
  protected readonly loanKey = (l: DemoLoan) => l.id;
  protected readonly loanSelectLabel = (l: DemoLoan) => `Select ${l.title}`;
  protected readonly chart: BarPoint[] = [
    { label: 'Mon', value: 18 },
    { label: 'Tue', value: 24 },
    { label: 'Wed', value: 15 },
    { label: 'Thu', value: 30 },
    { label: 'Fri', value: 22 },
    { label: 'Sat', value: 12 },
    { label: 'Sun', value: 8 },
  ];
  // The table renders sort affordances but never reorders its own rows, so the
  // page slice is taken from the sorted list rather than the source order.
  protected readonly pagedLoans = computed(() => {
    const sorted = sortRows(this.loans, this.sort(), this.cols);
    const start = (this.page() - 1) * 3;
    return sorted.slice(start, start + 3);
  });

  protected saveTitle(): void {
    this.dialogOpen.set(false);
    this.toast.show('Title added');
  }
}
