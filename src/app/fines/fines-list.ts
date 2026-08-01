import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  SegmentedOption,
  TableColumn,
  ToastService,
  UiBadge,
  UiCellDef,
  UiEmptyState,
  UiPagination,
  UiSegmented,
  UiTable,
} from '../ui';
import { FinesStore } from './fines.store';
import {
  fineBalance,
  fineReasonTone,
  fineStatusTone,
  type FineListItem,
  type FineStatusFilter,
} from './fines.types';

const FILTER_VALUES: FineStatusFilter[] = [
  'all',
  'outstanding',
  'partial',
  'paid',
  'waived',
];

@Component({
  selector: 'app-fines-list',
  providers: [FinesStore],
  imports: [
    CurrencyPipe,
    DatePipe,
    TranslocoPipe,
    UiBadge,
    UiCellDef,
    UiEmptyState,
    UiPagination,
    UiSegmented,
    UiTable,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-[15px] font-bold text-ink-heading">
            {{ 'fines.title' | transloco }}
          </h2>
          <p class="mt-0.5 text-[12.5px] text-ink-muted">
            {{ 'fines.subtitle' | transloco: { count: store.total() } }}
          </p>
        </div>
        <ui-segmented
          [options]="filterOptions"
          [value]="store.statusFilter()"
          (valueChange)="onFilterChange($event)"
          [groupLabel]="'fines.filtersLabel' | transloco"
        />
      </div>

      <ui-table
        [columns]="columns"
        [rows]="store.rows()"
        [caption]="'fines.tableCaption' | transloco"
        [rowKey]="rowId"
        minWidth="860px"
      >
        <ng-template uiCell="member" let-row>
          <div>
            <div class="font-semibold text-ink">{{ row.member?.name }}</div>
            <div class="text-xs text-ink-muted">{{ row.member?.card_barcode }}</div>
          </div>
        </ng-template>
        <ng-template uiCell="reason" let-row>
          <span uiBadge [tone]="fineReasonTone(row.reason)">
            {{ 'fines.reason.' + row.reason | transloco }}
          </span>
        </ng-template>
        <ng-template uiCell="amount" let-row>
          <span class="tabular-nums">{{ row.amount | currency: store.currency() }}</span>
        </ng-template>
        <ng-template uiCell="paid" let-row>
          <span class="tabular-nums">{{ row.amount_paid | currency: store.currency() }}</span>
        </ng-template>
        <ng-template uiCell="balance" let-row>
          <span class="font-semibold tabular-nums">
            {{ balance(row) | currency: store.currency() }}
          </span>
        </ng-template>
        <ng-template uiCell="status" let-row>
          <span uiBadge [tone]="fineStatusTone(row.status)">
            {{ 'fines.status.' + row.status | transloco }}
          </span>
        </ng-template>
        <ng-template uiCell="created" let-row>
          {{ row.created_at | date: 'mediumDate' }}
        </ng-template>
        <ui-empty-state
          [headline]="
            (store.statusFilter() === 'all'
              ? 'fines.empty.headline'
              : 'fines.empty.filteredHeadline'
            )
              | transloco
          "
          [message]="
            (store.statusFilter() === 'all'
              ? 'fines.empty.message'
              : 'fines.empty.filteredMessage'
            )
              | transloco
          "
        />
      </ui-table>

      <ui-pagination
        [page]="store.page()"
        (pageChange)="onPageChange($event)"
        [pageSize]="store.pageSize"
        [total]="store.total()"
        [prevLabel]="'fines.pagination.prev' | transloco"
        [nextLabel]="'fines.pagination.next' | transloco"
        [navLabel]="'fines.pagination.nav' | transloco"
        [summary]="pageSummary"
      />
    </div>
  `,
})
export class FinesList implements OnInit {
  protected readonly store = inject(FinesStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly fineReasonTone = fineReasonTone;
  protected readonly fineStatusTone = fineStatusTone;
  protected readonly balance = fineBalance;

  protected readonly filterOptions: SegmentedOption[] = FILTER_VALUES.map((value) => ({
    value,
    label: this.transloco.translate(`fines.filter.${value}`),
  }));

  protected readonly columns: TableColumn<FineListItem>[] = [
    {
      key: 'member',
      header: this.transloco.translate('fines.columns.member'),
      width: '22%',
    },
    {
      key: 'reason',
      header: this.transloco.translate('fines.columns.reason'),
      width: '12%',
    },
    {
      key: 'amount',
      header: this.transloco.translate('fines.columns.amount'),
      width: '12%',
      align: 'right',
    },
    {
      key: 'paid',
      header: this.transloco.translate('fines.columns.paid'),
      width: '12%',
      align: 'right',
    },
    {
      key: 'balance',
      header: this.transloco.translate('fines.columns.balance'),
      width: '12%',
      align: 'right',
    },
    {
      key: 'status',
      header: this.transloco.translate('fines.columns.status'),
      width: '14%',
    },
    {
      key: 'created',
      header: this.transloco.translate('fines.columns.created'),
      width: '16%',
    },
  ];

  protected readonly pageSummary = ({
    from,
    to,
    total,
  }: {
    from: number;
    to: number;
    total: number;
  }) => this.transloco.translate('fines.pagination.summary', { from, to, total });

  protected readonly rowId = (row: FineListItem) => row.id;

  ngOnInit(): void {
    void this.store.init().then(() => this.toastOnError());
  }

  protected async onFilterChange(value: string | undefined): Promise<void> {
    if (!value) return;
    await this.store.setStatusFilter(value as FineStatusFilter);
    this.toastOnError();
  }

  protected async onPageChange(page: number): Promise<void> {
    await this.store.setPage(page);
    this.toastOnError();
  }

  private toastOnError(): void {
    if (this.store.error()) {
      this.toast.error(this.transloco.translate('fines.errors.loadFailed'));
    }
  }
}
