import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject } from '@angular/core';
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
import { LoansStore } from './loans.store';
import type { LoanListItem, LoansTab, OverdueLoan } from './circulation.types';

const EMPTY_KEYS: Record<LoansTab, { headline: string; message: string }> = {
  active: {
    headline: 'circulation.loans.empty.activeHeadline',
    message: 'circulation.loans.empty.activeMessage',
  },
  overdue: {
    headline: 'circulation.loans.empty.overdueHeadline',
    message: 'circulation.loans.empty.overdueMessage',
  },
  returned: {
    headline: 'circulation.loans.empty.returnedHeadline',
    message: 'circulation.loans.empty.returnedMessage',
  },
};

@Component({
  selector: 'app-loans-panel',
  providers: [LoansStore],
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
            {{ 'circulation.loans.title' | transloco }}
          </h2>
          <p class="mt-0.5 text-[12.5px] text-ink-muted">
            {{ 'circulation.loans.subtitle' | transloco: { count: store.total() } }}
          </p>
        </div>
        <ui-segmented
          [options]="tabOptions"
          [value]="store.tab()"
          (valueChange)="onTabChange($event)"
          [groupLabel]="'circulation.loans.tabsLabel' | transloco"
        />
      </div>

      @if (store.tab() === 'overdue') {
        <ui-table
          [columns]="overdueColumns"
          [rows]="store.overdue()"
          [caption]="'circulation.loans.tableCaption' | transloco"
          [rowKey]="rowLoanId"
          minWidth="760px"
        >
          <ng-template uiCell="member" let-row>
            <div>
              <div class="font-semibold text-ink">{{ row.member_name }}</div>
              <div class="text-xs text-ink-muted">{{ row.member_card_barcode }}</div>
            </div>
          </ng-template>
          <ng-template uiCell="title" let-row>
            <div>
              <div class="font-semibold text-ink">{{ row.title }}</div>
              <div class="text-xs text-ink-muted">{{ row.author }}</div>
            </div>
          </ng-template>
          <ng-template uiCell="barcode" let-row>
            <span class="font-medium tabular-nums">{{ row.copy_barcode }}</span>
          </ng-template>
          <ng-template uiCell="due" let-row>
            {{ row.due_at | date: 'mediumDate' }}
          </ng-template>
          <ng-template uiCell="daysLate" let-row>
            <span uiBadge tone="warning">{{ row.days_late }}</span>
          </ng-template>
          <ng-template uiCell="projectedFine" let-row>
            <span class="font-semibold tabular-nums">
              {{ (row.projected_fine ?? 0) | currency: store.currency() }}
            </span>
          </ng-template>
          <ui-empty-state
            [headline]="EMPTY_KEYS.overdue.headline | transloco"
            [message]="EMPTY_KEYS.overdue.message | transloco"
          />
        </ui-table>
      } @else {
        <ui-table
          [columns]="loanColumns()"
          [rows]="store.loans()"
          [caption]="'circulation.loans.tableCaption' | transloco"
          [rowKey]="rowId"
          minWidth="720px"
        >
          <ng-template uiCell="member" let-row>
            <div>
              <div class="font-semibold text-ink">{{ row.member?.name }}</div>
              <div class="text-xs text-ink-muted">{{ row.member?.card_barcode }}</div>
            </div>
          </ng-template>
          <ng-template uiCell="title" let-row>
            <div>
              <div class="font-semibold text-ink">{{ row.copy?.title }}</div>
              <div class="text-xs text-ink-muted">{{ row.copy?.author }}</div>
            </div>
          </ng-template>
          <ng-template uiCell="barcode" let-row>
            <span class="font-medium tabular-nums">{{ row.copy?.barcode }}</span>
          </ng-template>
          <ng-template uiCell="due" let-row>
            {{ row.due_at | date: 'mediumDate' }}
          </ng-template>
          <ng-template uiCell="returnedAt" let-row>
            {{ row.returned_at | date: 'medium' }}
          </ng-template>
          <ui-empty-state
            [headline]="emptyKeys().headline | transloco"
            [message]="emptyKeys().message | transloco"
          />
        </ui-table>
      }

      <ui-pagination
        [page]="store.page()"
        (pageChange)="onPageChange($event)"
        [pageSize]="store.pageSize"
        [total]="store.total()"
        [prevLabel]="'circulation.loans.pagination.prev' | transloco"
        [nextLabel]="'circulation.loans.pagination.next' | transloco"
        [navLabel]="'circulation.loans.pagination.nav' | transloco"
        [summary]="pageSummary"
      />
    </div>
  `,
})
export class LoansPanel implements OnInit {
  protected readonly store = inject(LoansStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly EMPTY_KEYS = EMPTY_KEYS;

  protected readonly tabOptions: SegmentedOption[] = (
    ['active', 'overdue', 'returned'] as const
  ).map((value) => ({
    value,
    label: this.transloco.translate(`circulation.loans.${value}`),
  }));

  protected readonly loanColumns = computed<TableColumn<LoanListItem>[]>(() => {
    const returned = this.store.tab() === 'returned';
    return [
      {
        key: 'member',
        header: this.transloco.translate('circulation.loans.columns.member'),
        width: '28%',
      },
      {
        key: 'title',
        header: this.transloco.translate('circulation.loans.columns.title'),
        width: '30%',
      },
      {
        key: 'barcode',
        header: this.transloco.translate('circulation.loans.columns.barcode'),
        width: '16%',
      },
      returned
        ? {
            key: 'returnedAt',
            header: this.transloco.translate('circulation.loans.columns.returnedAt'),
            width: '26%',
          }
        : {
            key: 'due',
            header: this.transloco.translate('circulation.loans.columns.due'),
            width: '26%',
          },
    ];
  });

  protected readonly overdueColumns: TableColumn<OverdueLoan>[] = [
    {
      key: 'member',
      header: this.transloco.translate('circulation.loans.columns.member'),
      width: '24%',
    },
    {
      key: 'title',
      header: this.transloco.translate('circulation.loans.columns.title'),
      width: '26%',
    },
    {
      key: 'barcode',
      header: this.transloco.translate('circulation.loans.columns.barcode'),
      width: '14%',
    },
    {
      key: 'due',
      header: this.transloco.translate('circulation.loans.columns.due'),
      width: '12%',
    },
    {
      key: 'daysLate',
      header: this.transloco.translate('circulation.loans.columns.daysLate'),
      width: '12%',
    },
    {
      key: 'projectedFine',
      header: this.transloco.translate('circulation.loans.columns.projectedFine'),
      width: '12%',
      align: 'right',
    },
  ];

  protected readonly pageSummary = ({ from, to, total }: { from: number; to: number; total: number }) =>
    this.transloco.translate('circulation.loans.pagination.summary', { from, to, total });

  protected readonly rowId = (row: LoanListItem) => row.id;
  protected readonly rowLoanId = (row: OverdueLoan) => row.loan_id;

  ngOnInit(): void {
    void this.store.init().then(() => this.toastOnError());
  }

  protected async onTabChange(value: string | undefined): Promise<void> {
    if (!value) return;
    await this.store.setTab(value as LoansTab);
    this.toastOnError();
  }

  protected async onPageChange(page: number): Promise<void> {
    await this.store.setPage(page);
    this.toastOnError();
  }

  protected emptyKeys(): { headline: string; message: string } {
    return EMPTY_KEYS[this.store.tab()];
  }

  private toastOnError(): void {
    if (this.store.error()) {
      this.toast.error(this.transloco.translate('circulation.loans.errors.loadFailed'));
    }
  }
}
