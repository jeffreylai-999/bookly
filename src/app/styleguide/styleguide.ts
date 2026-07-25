import { Component, computed, inject, signal } from '@angular/core';
import {
  BarPoint,
  SegmentedOption,
  TableColumn,
  ToastService,
  UiAvatar,
  UiBadge,
  UiBarChart,
  UiBtn,
  UiCard,
  UiCellDef,
  UiEmptyState,
  UiKpiCard,
  UiLayout,
  UiListItem,
  UiPagination,
  UiProgress,
  UiSearchInput,
  UiSegmented,
  UiSidebarNavItem,
  UiTable,
  UiToastHost,
  UiTopbar,
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
    UiEmptyState,
    UiKpiCard,
    UiLayout,
    UiListItem,
    UiPagination,
    UiProgress,
    UiSearchInput,
    UiSegmented,
    UiSidebarNavItem,
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
          <ui-kpi-card label="Books on loan" [value]="342" delta="12% vs yesterday" deltaTone="good" [hero]="true" />
          <ui-kpi-card label="Overdue" [value]="18" delta="3 more than last week" deltaTone="bad" />
          <ui-kpi-card label="Holds waiting" [value]="27" delta="2 new since yesterday" deltaTone="neutral" />
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
            <ui-segmented [options]="tabs" [(value)]="tab" />
            <div class="flex items-center gap-3">
              <ui-search-input class="w-72" placeholder="Search titles, authors, ISBN" [(value)]="query" />
              <span class="text-[13px] text-ink-muted">{{ query() ? 'Filtering: ' + query() : 'No filter' }}</span>
            </div>
          </div>
        </ui-card>

        <ui-table [columns]="cols" [rows]="pagedLoans()" [rowKey]="loanKey">
          <ng-template uiCell="member" let-row>
            <span class="flex items-center gap-2.5">
              <ui-avatar [name]="row.member" [size]="28" />
              {{ row.member }}
            </span>
          </ng-template>
          <ng-template uiCell="status" let-row>
            <span uiBadge [tone]="row.status">{{ row.statusLabel }}</span>
          </ng-template>
          <ui-empty-state headline="No loans match your filters." message="Try clearing the search." />
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
              <ui-list-item icon="check-circle-2" iconTone="success" title="The Left Hand of Darkness" meta="Maya Chen · ready for pickup" />
              <ui-list-item icon="clock" iconTone="warning" title="Project Hail Mary" meta="Dev Patel · due tomorrow">
                <span uiBadge tone="danger">2 days</span>
              </ui-list-item>
              <ui-list-item icon="alert-circle" iconTone="danger" title="Snow Crash" meta="Sam Ortiz · 6 days overdue" />
            </div>
          </ui-card>
          <ui-card title="Empty state">
            <ui-empty-state headline="Nothing overdue — nice." message="All loans are on schedule.">
              <button uiBtn variant="pill-muted">Clear filters</button>
            </ui-empty-state>
          </ui-card>
        </div>
      </div>

      <ui-toast-host />
    </ui-layout>
  `,
})
export class Styleguide {
  protected readonly toast = inject(ToastService);
  protected readonly query = signal('');
  protected readonly tab = signal('active');
  protected readonly page = signal(1);
  protected readonly tabs: SegmentedOption[] = [
    { label: 'Active', value: 'active' },
    { label: 'Overdue', value: 'overdue' },
    { label: 'Returned', value: 'returned' },
  ];
  protected readonly cols: TableColumn<DemoLoan>[] = [
    { key: 'title', header: 'Title', width: '35%' },
    { key: 'member', header: 'Member', width: '30%' },
    { key: 'status', header: 'Status' },
    { key: 'due', header: 'Due', align: 'right' },
  ];
  protected readonly loans: DemoLoan[] = [
    { id: 1, title: 'Dune', member: 'Maya Chen', status: 'info', statusLabel: 'On loan', due: 'Jul 28, 2026' },
    { id: 2, title: '1984', member: 'Dev Patel', status: 'warning', statusLabel: 'Due soon', due: 'Jul 26, 2026' },
    { id: 3, title: 'Snow Crash', member: 'Sam Ortiz', status: 'danger', statusLabel: 'Overdue', due: 'Jul 19, 2026' },
    { id: 4, title: 'The Dispossessed', member: 'Ana Silva', status: 'success', statusLabel: 'Returned', due: 'Jul 22, 2026' },
    { id: 5, title: 'Hyperion', member: 'Liu Wei', status: 'info', statusLabel: 'On loan', due: 'Aug 2, 2026' },
  ];
  protected readonly loanKey = (l: DemoLoan) => l.id;
  protected readonly chart: BarPoint[] = [
    { label: 'Mon', value: 18 },
    { label: 'Tue', value: 24 },
    { label: 'Wed', value: 15 },
    { label: 'Thu', value: 30 },
    { label: 'Fri', value: 22 },
    { label: 'Sat', value: 12 },
    { label: 'Sun', value: 8 },
  ];
  protected readonly pagedLoans = computed(() => {
    const start = (this.page() - 1) * 3;
    return this.loans.slice(start, start + 3);
  });
}
