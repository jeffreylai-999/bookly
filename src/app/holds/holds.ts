import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  ToastService,
  UiBadge,
  UiBtn,
  UiCellDef,
  UiDialog,
  UiEmptyState,
  UiPagination,
  UiSearchInput,
  UiSelect,
  UiTable,
  type SelectOption,
  type TableColumn,
} from '../ui';
import { HoldsStore } from './holds.store';
import {
  HOLDS_ERROR_KEYS,
  holdStatusTone,
  type HoldListItem,
  type HoldStatus,
  type HoldStatusFilter,
} from './holds.types';

const STATUS_FILTERS: HoldStatus[] = ['waiting', 'ready', 'fulfilled', 'cancelled', 'expired'];

const DAY_MS = 24 * 60 * 60 * 1000;

@Component({
  selector: 'app-holds',
  providers: [HoldsStore],
  imports: [
    DatePipe,
    TranslocoPipe,
    UiBadge,
    UiBtn,
    UiCellDef,
    UiDialog,
    UiEmptyState,
    UiPagination,
    UiSearchInput,
    UiSelect,
    UiTable,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 class="text-[15px] font-bold text-ink-heading">
            {{ 'holds.title' | transloco }}
          </h2>
          <p class="mt-0.5 text-[12.5px] text-ink-muted" aria-live="polite">
            {{ 'holds.subtitle' | transloco: { count: store.total() } }}
          </p>
        </div>
        <div class="w-44">
          <ui-select
            [options]="statusOptions()"
            [ariaLabel]="'holds.statusFilter' | transloco"
            [value]="store.status()"
            (valueChange)="onStatus($event)"
          />
        </div>
      </div>

      @if (store.error()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'holds.errors.loadFailed' | transloco }}
        </p>
      }

      @if (store.isEmpty()) {
        <div class="rounded-card border border-line bg-surface shadow-tab">
          <ui-empty-state
            [headline]="
              (store.hasActiveFilters()
                ? 'holds.empty.filteredHeadline'
                : 'holds.empty.headline'
              ) | transloco
            "
            [message]="
              (store.hasActiveFilters() ? 'holds.empty.filteredMessage' : 'holds.empty.message')
                | transloco
            "
          >
            @if (store.hasActiveFilters()) {
              <button uiBtn variant="outline" type="button" (click)="clearFilters()">
                {{ 'holds.actions.clearFilters' | transloco }}
              </button>
            }
          </ui-empty-state>
        </div>
      } @else {
        <ui-table
          [columns]="columns"
          [rows]="store.rows()"
          [rowKey]="rowId"
          [caption]="'holds.tableCaption' | transloco"
          minWidth="64rem"
        >
          <ng-template uiCell="member" let-row>
            <div class="font-semibold text-ink">{{ row.member?.name }}</div>
            <div class="text-[12.5px] tabular-nums text-ink-muted">
              {{ row.member?.card_barcode }}
            </div>
          </ng-template>
          <ng-template uiCell="title" let-row>
            <div class="font-semibold text-ink">{{ row.title?.title }}</div>
            <div class="text-[12.5px] text-ink-muted">{{ row.title?.author }}</div>
          </ng-template>
          <ng-template uiCell="position" let-row>
            @if (row.status === 'waiting' || row.status === 'ready') {
              <span class="tabular-nums text-ink">#{{ row.queue_position }}</span>
            } @else {
              <span class="text-ink-muted">—</span>
            }
          </ng-template>
          <ng-template uiCell="copy" let-row>
            <span class="tabular-nums text-ink">{{ row.copy?.barcode ?? '—' }}</span>
          </ng-template>
          <ng-template uiCell="expires" let-row>
            @if (row.expires_at) {
              <span
                class="tabular-nums"
                [class]="expiryClass(row)"
                [title]="
                  (expired(row) ? 'holds.expiredTooltip' : 'holds.expiresTooltip') | transloco
                "
              >
                {{ row.expires_at | date: 'mediumDate' }}
              </span>
            } @else {
              <span class="text-ink-muted">—</span>
            }
          </ng-template>
          <ng-template uiCell="age" let-row>
            <span class="tabular-nums text-ink-muted">
              {{ 'holds.ageDays' | transloco: { days: ageDays(row) } }}
            </span>
          </ng-template>
          <ng-template uiCell="status" let-row>
            <span uiBadge [tone]="statusTone(row.status)">
              {{ 'holds.status.' + row.status | transloco }}
            </span>
          </ng-template>
          <ng-template uiCell="actions" let-row>
            <div class="flex flex-wrap justify-end gap-2">
              @if (store.queueHeadIds().has(row.id)) {
                <button
                  uiBtn
                  variant="pill"
                  type="button"
                  [disabled]="store.busyId() !== null"
                  (click)="openMarkReady(row)"
                >
                  {{ 'holds.actions.markReady' | transloco }}
                </button>
              }
              @if (row.status === 'waiting' || row.status === 'ready') {
                <button
                  uiBtn
                  variant="pill-muted"
                  type="button"
                  [disabled]="store.busyId() !== null"
                  (click)="onCancel(row)"
                >
                  {{ 'holds.actions.cancel' | transloco }}
                </button>
              }
            </div>
          </ng-template>
        </ui-table>
        <div class="mt-4">
          <ui-pagination
            [page]="store.page()"
            [pageSize]="store.pageSize()"
            [total]="store.total()"
            [prevLabel]="'holds.pagination.prev' | transloco"
            [nextLabel]="'holds.pagination.next' | transloco"
            [navLabel]="'holds.pagination.nav' | transloco"
            [summary]="paginationSummary"
            (pageChange)="onPage($event)"
          />
        </div>
      }
    </div>

    <ui-dialog
      [(open)]="markReadyOpen"
      [heading]="'holds.markReadyDialog.heading' | transloco"
      [subtitle]="markReadySubtitle()"
      [closeLabel]="'holds.markReadyDialog.close' | transloco"
    >
      @if (markReadyRow(); as row) {
        <form class="flex flex-col gap-4" (submit)="onMarkReadyConfirm($event)" novalidate>
          <p class="text-xs text-ink-muted">
            {{ 'holds.markReadyDialog.hint' | transloco }}
          </p>
          <ui-search-input
            class="w-full"
            [(value)]="markBarcode"
            [placeholder]="'holds.markReadyDialog.scanPlaceholder' | transloco"
            [ariaLabel]="'holds.markReadyDialog.scanLabel' | transloco"
            (submitted)="onMarkReadyConfirm()"
          />

          @if (markReadyError(); as message) {
            <p role="alert" class="text-sm font-semibold text-danger">{{ message }}</p>
          }

          <div dialog-actions class="flex justify-end gap-3">
            <button uiBtn variant="outline" type="button" (click)="markReadyOpen.set(false)">
              {{ 'holds.markReadyDialog.cancel' | transloco }}
            </button>
            <button uiBtn type="submit" [disabled]="marking() || !markBarcode().trim()">
              {{
                (marking()
                  ? 'holds.markReadyDialog.working'
                  : 'holds.markReadyDialog.confirm'
                ) | transloco
              }}
            </button>
          </div>
        </form>
      }
    </ui-dialog>
  `,
})
export class Holds implements OnInit {
  protected readonly store = inject(HoldsStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly markReadyOpen = signal(false);
  protected readonly markReadyRow = signal<HoldListItem | null>(null);
  protected readonly markBarcode = signal('');
  protected readonly markReadyError = signal<string | null>(null);
  protected readonly marking = signal(false);

  protected readonly columns: TableColumn<HoldListItem>[] = [
    { key: 'member', header: '', width: '18%' },
    { key: 'title', header: '', width: '22%' },
    { key: 'position', header: '', width: '8%' },
    { key: 'copy', header: '', width: '12%' },
    { key: 'expires', header: '', width: '12%' },
    { key: 'age', header: '', width: '8%' },
    { key: 'status', header: '', width: '10%' },
    { key: 'actions', header: '', width: '10%', align: 'right' },
  ];

  protected readonly statusOptions = computed<SelectOption[]>(() => [
    { label: this.transloco.translate('holds.filter.all'), value: '' },
    ...STATUS_FILTERS.map((value) => ({
      label: this.transloco.translate(`holds.status.${value}`),
      value,
    })),
  ]);

  protected readonly rowId = (row: HoldListItem) => row.id;

  protected readonly paginationSummary = (range: {
    from: number;
    to: number;
    total: number;
  }): string => this.transloco.translate('holds.pagination.summary', range);

  protected readonly markReadySubtitle = computed(() => {
    const row = this.markReadyRow();
    if (!row) return '';
    return this.transloco.translate('holds.markReadyDialog.subtitle', {
      title: row.title?.title ?? '',
      name: row.member?.name ?? '',
    });
  });

  ngOnInit(): void {
    this.columns[0]!.header = this.transloco.translate('holds.columns.member');
    this.columns[1]!.header = this.transloco.translate('holds.columns.title');
    this.columns[2]!.header = this.transloco.translate('holds.columns.position');
    this.columns[3]!.header = this.transloco.translate('holds.columns.copy');
    this.columns[4]!.header = this.transloco.translate('holds.columns.expires');
    this.columns[5]!.header = this.transloco.translate('holds.columns.age');
    this.columns[6]!.header = this.transloco.translate('holds.columns.status');
    this.columns[7]!.header = this.transloco.translate('holds.columns.actions');
    void this.store.load();
  }

  protected statusTone(status: HoldStatus) {
    return holdStatusTone(status);
  }

  /** Hold age in whole days — the staleness aid for aged queues. */
  protected ageDays(row: HoldListItem): number {
    return Math.max(0, Math.floor((Date.now() - Date.parse(row.created_at)) / DAY_MS));
  }

  /** A ready hold past its expiry is stale; the desk can still check the copy
   *  out (lazy expiry), but the queue needs attention. */
  protected expired(row: HoldListItem): boolean {
    return (
      row.status === 'ready' && row.expires_at !== null && Date.parse(row.expires_at) <= Date.now()
    );
  }

  protected expiryClass(row: HoldListItem): string {
    return this.expired(row) ? 'font-semibold text-danger' : 'text-ink';
  }

  protected async onStatus(value: string): Promise<void> {
    await this.store.applyStatus(value as HoldStatusFilter);
  }

  protected async onPage(page: number): Promise<void> {
    await this.store.applyPage(page);
  }

  protected async clearFilters(): Promise<void> {
    await this.store.clearFilters();
  }

  protected openMarkReady(row: HoldListItem): void {
    this.markReadyRow.set(row);
    this.markBarcode.set('');
    this.markReadyError.set(null);
    this.markReadyOpen.set(true);
  }

  protected async onMarkReadyConfirm(event?: Event): Promise<void> {
    event?.preventDefault();
    const row = this.markReadyRow();
    const barcode = this.markBarcode().trim();
    if (!row || !barcode || this.marking()) return;

    this.marking.set(true);
    this.markReadyError.set(null);
    try {
      const result = await this.store.markReady(row.title_id, barcode);
      if (!result.ok) {
        this.markReadyError.set(this.transloco.translate(HOLDS_ERROR_KEYS[result.error]));
        return;
      }
      this.markReadyOpen.set(false);
      this.toast.show(
        this.transloco.translate('holds.toasts.markedReady', {
          name: row.member?.name ?? '',
        }),
      );
    } finally {
      this.marking.set(false);
    }
  }

  protected async onCancel(row: HoldListItem): Promise<void> {
    const result = await this.store.cancelHold(row.id);
    if (!result.ok) {
      this.toast.error(this.transloco.translate(HOLDS_ERROR_KEYS[result.error]));
      return;
    }
    this.toast.show(this.transloco.translate('holds.toasts.cancelled'));
  }
}
