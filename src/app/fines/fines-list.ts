import { CurrencyPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { form, FormField, required, submit, validate } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService } from '../core/auth';
import {
  SegmentedOption,
  TableColumn,
  ToastService,
  UiBadge,
  UiBtn,
  UiCellDef,
  UiDialog,
  UiEmptyState,
  UiField,
  UiKpiCard,
  UiPagination,
  UiSegmented,
  UiSelect,
  UiSkeleton,
  UiTable,
} from '../ui';
import { FinesStore } from './fines.store';
import {
  PAYMENT_ERROR_KEYS,
  PAYMENT_METHODS,
  VOID_ERROR_KEYS,
  WAIVE_ERROR_KEYS,
  fineAccrualLine,
  fineBalance,
  fineReasonTone,
  fineStatusTone,
  type FineListItem,
  type FineStatusFilter,
  type Payment,
  type PaymentMethod,
} from './fines.types';

const FILTER_VALUES: FineStatusFilter[] = [
  'all',
  'outstanding',
  'partial',
  'paid',
  'waived',
];

type PaymentFormValue = { amount: string; method: PaymentMethod };
type ReasonFormValue = { reason: string };

@Component({
  selector: 'app-fines-list',
  providers: [FinesStore, CurrencyPipe],
  imports: [
    CurrencyPipe,
    DatePipe,
    FormField,
    TranslocoPipe,
    UiBadge,
    UiBtn,
    UiCellDef,
    UiDialog,
    UiEmptyState,
    UiField,
    UiKpiCard,
    UiPagination,
    UiSegmented,
    UiSelect,
    UiSkeleton,
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

      @if (store.summaryError()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'fines.errors.loadFailed' | transloco }}
        </p>
      }
      <div class="grid gap-4 sm:grid-cols-3">
        <ui-kpi-card
          [label]="'fines.stats.outstanding' | transloco"
          [value]="statValue(store.summary()?.outstandingBalance)"
          [hero]="true"
        />
        <ui-kpi-card
          [label]="'fines.stats.collected' | transloco"
          [value]="statValue(store.summary()?.collectedTotal)"
        />
        <ui-kpi-card
          [label]="'fines.stats.waived' | transloco"
          [value]="statValue(store.summary()?.waivedTotal)"
        />
      </div>

      <ui-table
        [columns]="columns"
        [rows]="store.rows()"
        [caption]="'fines.tableCaption' | transloco"
        [rowKey]="rowId"
        minWidth="1020px"
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
        <ng-template uiCell="actions" let-row>
          <div class="flex flex-wrap items-center justify-end gap-2">
            @if (isPayable(row)) {
              <button uiBtn variant="pill" type="button" (click)="openPayment(row)">
                {{ 'fines.actions.pay' | transloco }}
              </button>
              @if (isAdmin()) {
                <button uiBtn variant="pill-muted" type="button" (click)="openWaive(row)">
                  {{ 'fines.actions.waive' | transloco }}
                </button>
              }
            }
            <button uiBtn variant="pill-muted" type="button" (click)="openDetails(row)">
              {{ 'fines.actions.details' | transloco }}
            </button>
          </div>
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

    <!-- Record payment -->
    <ui-dialog
      [(open)]="paymentOpen"
      [heading]="'fines.payment.heading' | transloco"
      [subtitle]="paymentSubtitle()"
      [closeLabel]="'fines.payment.cancel' | transloco"
    >
      <form id="payment-form" class="flex flex-col gap-2" (submit)="onPaymentSubmit($event)" novalidate>
        @let amountKey = amountErrorKey();
        @let amountErrorText = amountKey ? (amountKey | transloco: amountErrorParams()) : undefined;

        <ui-field
          [label]="'fines.payment.amount' | transloco"
          [hint]="'fines.payment.amountHint' | transloco"
          [error]="amountErrorText"
          [required]="true"
          #amountField
        >
          <input
            type="number"
            step="0.01"
            inputmode="decimal"
            autocomplete="off"
            [id]="amountField.controlId"
            [attr.aria-describedby]="amountField.describedBy()"
            [attr.aria-invalid]="amountErrorText ? true : null"
            [formField]="paymentForm.amount"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        <ui-field [label]="'fines.payment.method' | transloco" [required]="true" #methodField>
          <ui-select
            [controlId]="methodField.controlId"
            [describedBy]="methodField.describedBy()"
            [options]="methodOptions"
            [value]="paymentForm.method().value()"
            (valueChange)="onPaymentMethodChange($event)"
          />
        </ui-field>
      </form>

      <div dialog-actions class="contents">
        <button uiBtn variant="outline" type="button" (click)="paymentOpen.set(false)">
          {{ 'fines.payment.cancel' | transloco }}
        </button>
        <button
          uiBtn
          type="submit"
          form="payment-form"
          [disabled]="store.busy() || paymentForm().invalid()"
        >
          {{
            (store.busy() ? 'fines.payment.working' : 'fines.payment.confirm') | transloco
          }}
        </button>
      </div>
    </ui-dialog>

    <!-- Receipt confirmation -->
    <ui-dialog
      [(open)]="receiptOpen"
      [heading]="'fines.receipt.heading' | transloco"
      [subtitle]="'fines.receipt.subtitle' | transloco"
      [closeLabel]="'fines.receipt.done' | transloco"
    >
      @if (store.receipt(); as receipt) {
        <dl class="flex flex-col gap-2.5 text-sm">
          <div class="flex items-center justify-between gap-3">
            <dt class="text-ink-muted">{{ 'fines.receipt.paidLabel' | transloco }}</dt>
            <dd class="font-bold tabular-nums text-ink-heading">
              {{ receipt.payment.amount | currency: store.currency() }}
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-ink-muted">{{ 'fines.receipt.methodLabel' | transloco }}</dt>
            <dd class="font-semibold text-ink">{{ methodLabel(receipt.payment.method) }}</dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-ink-muted">{{ 'fines.receipt.statusLabel' | transloco }}</dt>
            <dd>
              <span uiBadge [tone]="fineStatusTone(receipt.fine.status)">
                {{ 'fines.status.' + receipt.fine.status | transloco }}
              </span>
            </dd>
          </div>
          <div class="flex items-center justify-between gap-3">
            <dt class="text-ink-muted">{{ 'fines.receipt.remainingLabel' | transloco }}</dt>
            <dd class="font-semibold tabular-nums text-ink">
              {{ balance(receipt.fine) | currency: store.currency() }}
            </dd>
          </div>
        </dl>
      }

      <div dialog-actions class="contents">
        <button uiBtn type="button" (click)="closeReceipt()">
          {{ 'fines.receipt.done' | transloco }}
        </button>
      </div>
    </ui-dialog>

    <!-- Waive (admin) -->
    <ui-dialog
      [(open)]="waiveOpen"
      [heading]="'fines.waive.heading' | transloco"
      [subtitle]="waiveSubtitle()"
      [closeLabel]="'fines.waive.cancel' | transloco"
    >
      <form id="waive-form" class="flex flex-col gap-2" (submit)="onWaiveSubmit($event)" novalidate>
        @let reasonKey = waiveReasonErrorKey();
        @let reasonErrorText = reasonKey ? (reasonKey | transloco) : undefined;

        <ui-field
          [label]="'fines.waive.reason' | transloco"
          [hint]="'fines.waive.reasonHint' | transloco"
          [error]="reasonErrorText"
          [required]="true"
          #reasonField
        >
          <input
            type="text"
            autocomplete="off"
            [id]="reasonField.controlId"
            [attr.aria-describedby]="reasonField.describedBy()"
            [attr.aria-invalid]="reasonErrorText ? true : null"
            [formField]="waiveForm.reason"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>
      </form>

      <div dialog-actions class="contents">
        <button uiBtn variant="outline" type="button" (click)="waiveOpen.set(false)">
          {{ 'fines.waive.cancel' | transloco }}
        </button>
        <button
          uiBtn
          type="submit"
          form="waive-form"
          [disabled]="store.busy() || waiveForm().invalid()"
        >
          {{ (store.busy() ? 'fines.waive.working' : 'fines.waive.confirm') | transloco }}
        </button>
      </div>
    </ui-dialog>

    <!-- Fine details: origin, accrual rule, payment history + void -->
    <ui-dialog
      [(open)]="detailsOpen"
      [heading]="'fines.details.heading' | transloco"
      [closeLabel]="'fines.details.close' | transloco"
    >
      @if (store.selectedFine(); as fine) {
        <div class="flex flex-col gap-5">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm font-bold text-ink-heading">{{ fine.member?.name }}</p>
              <p class="mt-0.5 text-xs text-ink-muted">{{ fine.member?.card_barcode }}</p>
              <p class="mt-2 text-xs text-ink-muted">
                {{ fine.created_at | date: 'medium' }}
              </p>
            </div>
            <div class="flex items-center gap-2">
              <span uiBadge [tone]="fineReasonTone(fine.reason)">
                {{ 'fines.reason.' + fine.reason | transloco }}
              </span>
              <span uiBadge [tone]="fineStatusTone(fine.status)">
                {{ 'fines.status.' + fine.status | transloco }}
              </span>
            </div>
          </div>

          <dl class="grid grid-cols-3 gap-3 rounded-[10px] border border-line bg-canvas px-4 py-3 text-sm">
            <div>
              <dt class="text-xs text-ink-muted">{{ 'fines.columns.amount' | transloco }}</dt>
              <dd class="mt-0.5 font-semibold tabular-nums text-ink">
                {{ fine.amount | currency: store.currency() }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-ink-muted">{{ 'fines.columns.paid' | transloco }}</dt>
              <dd class="mt-0.5 font-semibold tabular-nums text-ink">
                {{ fine.amount_paid | currency: store.currency() }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-ink-muted">{{ 'fines.columns.balance' | transloco }}</dt>
              <dd class="mt-0.5 font-bold tabular-nums text-ink-heading">
                {{ balance(fine) | currency: store.currency() }}
              </dd>
            </div>
          </dl>

          <div>
            <p class="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
              {{ 'fines.details.originHeading' | transloco }}
            </p>
            @if (fine.loan?.copy; as copy) {
              <p class="mt-1.5 text-sm font-semibold text-ink">
                {{ copy.titles?.title }}
                <span class="font-normal text-ink-muted">· {{ copy.titles?.author }}</span>
              </p>
              <p class="mt-0.5 text-xs tabular-nums text-ink-muted">{{ copy.barcode }}</p>
              <p class="mt-1 text-xs text-ink-muted">
                {{ 'fines.details.due' | transloco: { due: fine.loan.due_at | date: 'mediumDate' } }}
                @if (fine.loan.returned_at) {
                  ·
                  {{ 'fines.details.returned' | transloco: { returned: fine.loan.returned_at | date: 'mediumDate' } }}
                }
              </p>
            } @else {
              <p class="mt-1.5 text-sm text-ink-muted">
                {{ 'fines.details.noLoan' | transloco }}
              </p>
            }
            @if (accrualLine(fine); as line) {
              <p class="mt-1.5 text-xs text-ink-muted">{{ line }}</p>
            }
          </div>

          <div>
            <p class="text-xs font-bold uppercase tracking-[0.06em] text-ink-muted">
              {{ 'fines.details.paymentsHeading' | transloco }}
            </p>
            @if (store.paymentsLoading()) {
              <div class="mt-2"><ui-skeleton [rows]="2" /></div>
            } @else if (store.paymentsError()) {
              <p role="alert" class="mt-1.5 text-sm font-semibold text-danger">
                {{ 'fines.details.paymentsError' | transloco }}
              </p>
            } @else if (store.payments().length === 0) {
              <p class="mt-1.5 text-sm text-ink-muted">
                {{ 'fines.details.paymentsEmpty' | transloco }}
              </p>
            } @else {
              <ul class="mt-2 divide-y divide-divider rounded-[10px] border border-line">
                @for (payment of store.payments(); track payment.id) {
                  <li class="px-3 py-2.5">
                    <div class="flex flex-wrap items-center justify-between gap-2">
                      <div class="min-w-0">
                        <span class="text-sm font-semibold tabular-nums text-ink">
                          {{ payment.amount | currency: store.currency() }}
                        </span>
                        <span class="ml-2 text-xs text-ink-muted">
                          {{ methodLabel(payment.method) }} ·
                          {{ payment.created_at | date: 'mediumDate' }}
                        </span>
                        @if (payment.voided_by) {
                          <span uiBadge tone="neutral" class="ml-2">
                            {{ 'fines.details.voidedBadge' | transloco }}
                          </span>
                        }
                      </div>
                      @if (isAdmin() && !payment.voided_by && fine.status !== 'waived') {
                        <button
                          uiBtn
                          variant="pill-muted"
                          type="button"
                          (click)="startVoid(payment)"
                        >
                          {{ 'fines.details.void' | transloco }}
                        </button>
                      }
                    </div>
                    @if (payment.voided_by && payment.void_reason) {
                      <p class="mt-1 text-xs text-ink-muted">
                        {{ 'fines.details.voidReason' | transloco: { reason: payment.void_reason } }}
                      </p>
                    }
                    @if (voidingId() === payment.id) {
                      <form
                        class="mt-2 flex flex-wrap items-center gap-2"
                        (submit)="onVoidSubmit($event, payment)"
                        novalidate
                      >
                        @let voidReasonKey = voidReasonErrorKey();
                        @let voidReasonText = voidReasonKey ? (voidReasonKey | transloco) : undefined;
                        <ui-field
                          class="min-w-52 flex-1"
                          [label]="'fines.details.voidReasonLabel' | transloco"
                          [error]="voidReasonText"
                          #voidField
                        >
                          <input
                            type="text"
                            autocomplete="off"
                            [id]="voidField.controlId"
                            [attr.aria-describedby]="voidField.describedBy()"
                            [attr.aria-invalid]="voidReasonText ? true : null"
                            [placeholder]="'fines.details.voidReasonPlaceholder' | transloco"
                            [formField]="voidForm.reason"
                            class="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink focus-ring focus:border-brand"
                          />
                        </ui-field>
                        <button
                          uiBtn
                          variant="pill"
                          type="submit"
                          [disabled]="store.busy() || voidForm().invalid()"
                        >
                          {{ 'fines.details.voidConfirm' | transloco }}
                        </button>
                        <button
                          uiBtn
                          variant="pill-muted"
                          type="button"
                          (click)="voidingId.set(null)"
                        >
                          {{ 'fines.details.voidCancel' | transloco }}
                        </button>
                      </form>
                    }
                  </li>
                }
              </ul>
            }
          </div>
        </div>
      }

      <div dialog-actions class="contents">
        <button uiBtn variant="outline" type="button" (click)="closeDetails()">
          {{ 'fines.details.close' | transloco }}
        </button>
      </div>
    </ui-dialog>
  `,
})
export class FinesList implements OnInit {
  protected readonly store = inject(FinesStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);
  private readonly currencyPipe = inject(CurrencyPipe);

  protected readonly isAdmin = this.auth.isAdmin;
  protected readonly fineReasonTone = fineReasonTone;
  protected readonly fineStatusTone = fineStatusTone;
  protected readonly balance = fineBalance;

  protected readonly paymentOpen = signal(false);
  protected readonly receiptOpen = signal(false);
  protected readonly waiveOpen = signal(false);
  protected readonly detailsOpen = signal(false);
  protected readonly paymentFine = signal<FineListItem | null>(null);
  protected readonly waiveTarget = signal<FineListItem | null>(null);
  protected readonly voidingId = signal<string | null>(null);

  protected readonly paymentModel = signal<PaymentFormValue>({ amount: '', method: 'cash' });
  protected readonly waiveModel = signal<ReasonFormValue>({ reason: '' });
  protected readonly voidModel = signal<ReasonFormValue>({ reason: '' });

  protected readonly paymentForm = form(this.paymentModel, (path) => {
    required(path.amount);
    required(path.method);
    validate(path.amount, ({ value }) => {
      const raw = value().trim();
      if (!raw) return null; // required owns the empty case
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return { kind: 'invalid' };
      }
      const fine = this.paymentFine();
      if (fine && parsed > fineBalance(fine)) {
        return { kind: 'exceeds' };
      }
      return null;
    });
  });

  protected readonly waiveForm = form(this.waiveModel, (path) => {
    required(path.reason);
  });

  protected readonly voidForm = form(this.voidModel, (path) => {
    required(path.reason);
  });

  protected readonly filterOptions: SegmentedOption[] = FILTER_VALUES.map((value) => ({
    value,
    label: this.transloco.translate(`fines.filter.${value}`),
  }));

  protected readonly methodOptions = PAYMENT_METHODS.map((value) => ({
    value,
    label: this.transloco.translate(`fines.methods.${value}`),
  }));

  protected readonly columns: TableColumn<FineListItem>[] = [
    {
      key: 'member',
      header: this.transloco.translate('fines.columns.member'),
      width: '17%',
    },
    {
      key: 'reason',
      header: this.transloco.translate('fines.columns.reason'),
      width: '10%',
    },
    {
      key: 'amount',
      header: this.transloco.translate('fines.columns.amount'),
      width: '10%',
      align: 'right',
    },
    {
      key: 'paid',
      header: this.transloco.translate('fines.columns.paid'),
      width: '10%',
      align: 'right',
    },
    {
      key: 'balance',
      header: this.transloco.translate('fines.columns.balance'),
      width: '11%',
      align: 'right',
    },
    {
      key: 'status',
      header: this.transloco.translate('fines.columns.status'),
      width: '11%',
    },
    {
      key: 'created',
      header: this.transloco.translate('fines.columns.created'),
      width: '12%',
    },
    {
      key: 'actions',
      header: this.transloco.translate('fines.columns.actions'),
      width: '19%',
      align: 'right',
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

  protected readonly paymentSubtitle = computed(() => {
    const fine = this.paymentFine();
    if (!fine) return '';
    return this.transloco.translate('fines.payment.subtitle', {
      member: fine.member?.name ?? '',
      balance: this.money(fineBalance(fine)),
    });
  });

  protected readonly waiveSubtitle = computed(() => {
    const fine = this.waiveTarget();
    if (!fine) return '';
    return this.transloco.translate('fines.waive.subtitle', {
      member: fine.member?.name ?? '',
      forgiven: this.money(fineBalance(fine)),
    });
  });

  protected readonly amountErrorKey = computed(() => {
    const field = this.paymentForm.amount();
    if (!field.touched() || !field.invalid()) return undefined;
    if (field.getError('required')) return 'fines.payment.errors.amountRequired';
    if (field.getError('exceeds')) return 'fines.payment.errors.amountExceeds';
    return 'fines.payment.errors.amountInvalid';
  });

  protected readonly amountErrorParams = computed(() => {
    const fine = this.paymentFine();
    return fine ? { balance: this.money(fineBalance(fine)) } : {};
  });

  protected readonly waiveReasonErrorKey = computed(() => {
    const field = this.waiveForm.reason();
    if (!field.touched() || !field.invalid()) return undefined;
    return 'fines.waive.errors.reasonRequired';
  });

  protected readonly voidReasonErrorKey = computed(() => {
    const field = this.voidForm.reason();
    if (!field.touched() || !field.invalid()) return undefined;
    return 'fines.details.voidReasonRequired';
  });

  ngOnInit(): void {
    void this.store.init().then(() => this.toastOnError());
  }

  protected statValue(value: number | undefined): string {
    return value === undefined ? '—' : this.money(value);
  }

  protected isPayable(row: FineListItem): boolean {
    return (row.status === 'outstanding' || row.status === 'partial') && fineBalance(row) > 0;
  }

  protected methodLabel(method: string): string {
    return (PAYMENT_METHODS as readonly string[]).includes(method)
      ? this.transloco.translate(`fines.methods.${method}`)
      : method;
  }

  /** Renders the snapshotted accrual rule so staff can explain the charge. */
  protected accrualLine(fine: FineListItem): string | null {
    const line = fineAccrualLine(fine.reason, fine.accrual_rule_snapshot, (value) =>
      this.money(value),
    );
    return line ? this.transloco.translate(line.key, line.params ?? {}) : null;
  }

  protected openPayment(row: FineListItem): void {
    this.paymentFine.set(row);
    this.paymentModel.set({ amount: fineBalance(row).toFixed(2), method: 'cash' });
    this.paymentOpen.set(true);
  }

  protected onPaymentMethodChange(value: string): void {
    if (!(PAYMENT_METHODS as readonly string[]).includes(value)) {
      return;
    }
    this.paymentModel.update((current) => ({ ...current, method: value as PaymentMethod }));
    this.paymentForm.method().markAsTouched();
  }

  protected async onPaymentSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.paymentForm, async () => {
      const fine = this.paymentFine();
      if (!fine) return;
      const value = this.paymentModel();
      const result = await this.store.recordPayment(
        fine.id,
        Number(value.amount),
        value.method,
      );
      if (!result.ok) {
        this.toast.error(this.transloco.translate(PAYMENT_ERROR_KEYS[result.error]));
        return;
      }
      this.paymentOpen.set(false);
      this.receiptOpen.set(true);
      this.toast.show(this.transloco.translate('fines.toasts.paymentRecorded'));
    });
  }

  protected closeReceipt(): void {
    this.receiptOpen.set(false);
    this.store.clearReceipt();
  }

  protected openWaive(row: FineListItem): void {
    this.waiveTarget.set(row);
    this.waiveModel.set({ reason: '' });
    this.waiveOpen.set(true);
  }

  protected async onWaiveSubmit(event: Event): Promise<void> {
    event.preventDefault();
    await submit(this.waiveForm, async () => {
      const fine = this.waiveTarget();
      if (!fine) return;
      const result = await this.store.waiveFine(fine.id, this.waiveModel().reason.trim());
      if (!result.ok) {
        this.toast.error(this.transloco.translate(WAIVE_ERROR_KEYS[result.error]));
        return;
      }
      this.waiveOpen.set(false);
      this.toast.show(this.transloco.translate('fines.toasts.waived'));
    });
  }

  protected openDetails(row: FineListItem): void {
    this.voidingId.set(null);
    this.detailsOpen.set(true);
    void this.store.openDetails(row);
  }

  protected closeDetails(): void {
    this.detailsOpen.set(false);
    this.voidingId.set(null);
    this.store.closeDetails();
  }

  protected startVoid(payment: Payment): void {
    this.voidModel.set({ reason: '' });
    this.voidingId.set(payment.id);
  }

  protected async onVoidSubmit(event: Event, payment: Payment): Promise<void> {
    event.preventDefault();
    await submit(this.voidForm, async () => {
      const result = await this.store.voidPayment(payment.id, this.voidModel().reason.trim());
      if (!result.ok) {
        this.toast.error(this.transloco.translate(VOID_ERROR_KEYS[result.error]));
        return;
      }
      this.voidingId.set(null);
      this.toast.show(this.transloco.translate('fines.toasts.voided'));
    });
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

  private money(value: number): string {
    return this.currencyPipe.transform(value, this.store.currency()) ?? '';
  }

  private toastOnError(): void {
    if (this.store.error()) {
      this.toast.error(this.transloco.translate('fines.errors.loadFailed'));
    }
  }
}
