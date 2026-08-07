import { CurrencyPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormField, form, min, pattern, required, submit, validate } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  SelectOption,
  TableColumn,
  ToastService,
  UiBtn,
  UiCard,
  UiCellDef,
  UiDialog,
  UiField,
  UiSkeleton,
  UiTable,
} from '../ui';
import { normalizeCurrency } from '../core/app-settings';
import { SettingsStore } from './settings.store';
import {
  CURRENCY_PATTERN,
  REPORT_RANGE_OPTIONS,
  isValidTimeZone,
  toAppSettingsFormValue,
  toMemberTypeFormValue,
  type AppSettingsFormValue,
  type MemberType,
  type MemberTypeFormValue,
  type SettingsMutationError,
} from './settings.types';

const MUTATION_ERROR_KEYS: Record<SettingsMutationError, string> = {
  name_taken: 'settings.errors.nameTaken',
  member_type_in_use: 'settings.errors.typeInUse',
  save_failed: 'settings.errors.saveFailed',
  audit_failed: 'settings.errors.auditFailed',
  load_failed: 'settings.errors.loadFailed',
};

const EMPTY_TYPE_FORM: MemberTypeFormValue = {
  name: '',
  loanPeriodDays: 21,
  renewalLimit: 2,
  borrowCap: 10,
  fineRatePerDay: 0.25,
  holdExpiryDays: 7,
};

const EMPTY_APP_FORM: AppSettingsFormValue = {
  currency: 'USD',
  timezone: 'America/New_York',
  defaultLocale: 'en',
  fineBlockThreshold: 10,
  damagedFeeDefault: 10,
  lostFeeDefault: 25,
  notifyOnHoldReady: true,
  notifyOnOverdue: true,
  notifyOnPayment: true,
  defaultReportRangeDays: '14',
};

@Component({
  selector: 'app-settings',
  providers: [SettingsStore],
  imports: [
    CurrencyPipe,
    FormField,
    TranslocoPipe,
    UiBtn,
    UiCard,
    UiCellDef,
    UiDialog,
    UiField,
    UiSkeleton,
    UiTable,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h2 class="text-[15px] font-bold text-ink-heading">
          {{ 'settings.title' | transloco }}
        </h2>
        <p class="mt-0.5 text-[12.5px] text-ink-muted">
          {{ 'settings.subtitle' | transloco }}
        </p>
      </div>

      @if (store.error()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'settings.errors.loadFailed' | transloco }}
        </p>
      }

      @if (store.loading()) {
        <div role="status" aria-live="polite" class="flex flex-col gap-2.5">
          <span class="sr-only">{{ 'settings.loading' | transloco }}</span>
          <ui-skeleton [rows]="5" />
        </div>
      } @else if (!store.error()) {
        <ui-card
          [title]="'settings.memberTypes.heading' | transloco"
          [subtitle]="'settings.memberTypes.subtitle' | transloco"
        >
          <button card-actions uiBtn type="button" (click)="openTypeCreate()">
            {{ 'settings.memberTypes.add' | transloco }}
          </button>

          @if (store.memberTypes().length === 0) {
            <p class="text-sm text-ink-muted">{{ 'settings.memberTypes.empty' | transloco }}</p>
          } @else {
            <div class="overflow-x-auto">
              <ui-table
                [caption]="'settings.memberTypes.tableCaption' | transloco"
                [columns]="typeColumns()"
                [rows]="store.memberTypes()"
                [rowKey]="typeRowKey"
                minWidth="52rem"
              >
                <ng-template uiCell="name" let-row>
                  <span class="font-semibold text-ink">{{ row.name }}</span>
                </ng-template>
                <ng-template uiCell="loanPeriod" let-row>
                  {{ 'settings.memberTypes.days' | transloco: { count: row.loan_period_days } }}
                </ng-template>
                <ng-template uiCell="renewals" let-row>
                  {{ row.renewal_limit }}
                </ng-template>
                <ng-template uiCell="borrowCap" let-row>
                  {{ row.borrow_cap }}
                </ng-template>
                <ng-template uiCell="fineRate" let-row>
                  {{ row.fine_rate_per_day | currency: currencyCode() }}
                </ng-template>
                <ng-template uiCell="holdExpiry" let-row>
                  {{ 'settings.memberTypes.days' | transloco: { count: row.hold_expiry_days } }}
                </ng-template>
                <ng-template uiCell="actions" let-row>
                  <div class="flex flex-wrap items-center justify-end gap-2">
                    <button uiBtn variant="pill-muted" type="button" (click)="openTypeEdit(row)">
                      {{ 'settings.memberTypes.edit' | transloco }}
                    </button>
                    <button uiBtn variant="pill" type="button" (click)="openTypeDelete(row)">
                      {{ 'settings.memberTypes.delete' | transloco }}
                    </button>
                  </div>
                </ng-template>
              </ui-table>
            </div>
          }
        </ui-card>

        @if (store.appSettings()) {
          <ui-card
            [title]="'settings.app.heading' | transloco"
            [subtitle]="'settings.app.subtitle' | transloco"
          >
            <form class="flex flex-col gap-5" (submit)="onAppSubmit($event)" novalidate>
              @let currencyKey = currencyErrorKey();
              @let currencyErrorText = currencyKey ? (currencyKey | transloco) : undefined;
              @let timezoneKey = timezoneErrorKey();
              @let timezoneErrorText = timezoneKey ? (timezoneKey | transloco) : undefined;
              @let thresholdKey = thresholdErrorKey();
              @let thresholdErrorText = thresholdKey ? (thresholdKey | transloco) : undefined;
              @let damagedKey = damagedErrorKey();
              @let damagedErrorText = damagedKey ? (damagedKey | transloco) : undefined;
              @let lostKey = lostErrorKey();
              @let lostErrorText = lostKey ? (lostKey | transloco) : undefined;

              <div class="grid gap-4 sm:grid-cols-2">
                <ui-field
                  [label]="'settings.app.currency' | transloco"
                  [hint]="'settings.app.currencyHint' | transloco"
                  [error]="currencyErrorText"
                  [required]="true"
                  #currencyField
                >
                  <input
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    [id]="currencyField.controlId"
                    [attr.aria-describedby]="currencyField.describedBy()"
                    [attr.aria-invalid]="currencyErrorText ? true : null"
                    [formField]="appForm.currency"
                    class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono text-sm uppercase text-ink focus-ring focus:border-brand"
                  />
                </ui-field>

                <ui-field
                  [label]="'settings.app.timezone' | transloco"
                  [hint]="'settings.app.timezoneHint' | transloco"
                  [error]="timezoneErrorText"
                  [required]="true"
                  #timezoneField
                >
                  <input
                    type="text"
                    autocomplete="off"
                    spellcheck="false"
                    [id]="timezoneField.controlId"
                    [attr.aria-describedby]="timezoneField.describedBy()"
                    [attr.aria-invalid]="timezoneErrorText ? true : null"
                    [formField]="appForm.timezone"
                    class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono text-sm text-ink focus-ring focus:border-brand"
                  />
                </ui-field>

                <ui-field [label]="'settings.app.defaultLocale' | transloco" #localeField>
                  <select
                    [id]="localeField.controlId"
                    [attr.aria-describedby]="localeField.describedBy()"
                    [formField]="appForm.defaultLocale"
                    class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
                  >
                    @for (option of localeOptions(); track option.value) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                </ui-field>

                <ui-field [label]="'settings.app.defaultReportRange' | transloco" #rangeField>
                  <select
                    [id]="rangeField.controlId"
                    [attr.aria-describedby]="rangeField.describedBy()"
                    [formField]="appForm.defaultReportRangeDays"
                    class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
                  >
                    @for (option of reportRangeOptions(); track option.value) {
                      <option [value]="option.value">{{ option.label }}</option>
                    }
                  </select>
                </ui-field>

                <ui-field
                  [label]="'settings.app.fineBlockThreshold' | transloco"
                  [hint]="'settings.app.fineBlockThresholdHint' | transloco"
                  [error]="thresholdErrorText"
                  [required]="true"
                  #thresholdField
                >
                  <input
                    type="number"
                    step="0.01"
                    inputmode="decimal"
                    [id]="thresholdField.controlId"
                    [attr.aria-describedby]="thresholdField.describedBy()"
                    [attr.aria-invalid]="thresholdErrorText ? true : null"
                    [formField]="appForm.fineBlockThreshold"
                    class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
                  />
                </ui-field>

                <ui-field
                  [label]="'settings.app.damagedFeeDefault' | transloco"
                  [error]="damagedErrorText"
                  [required]="true"
                  #damagedField
                >
                  <input
                    type="number"
                    step="0.01"
                    inputmode="decimal"
                    [id]="damagedField.controlId"
                    [attr.aria-describedby]="damagedField.describedBy()"
                    [attr.aria-invalid]="damagedErrorText ? true : null"
                    [formField]="appForm.damagedFeeDefault"
                    class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
                  />
                </ui-field>

                <ui-field
                  [label]="'settings.app.lostFeeDefault' | transloco"
                  [hint]="'settings.app.lostFeeDefaultHint' | transloco"
                  [error]="lostErrorText"
                  [required]="true"
                  #lostField
                >
                  <input
                    type="number"
                    step="0.01"
                    inputmode="decimal"
                    [id]="lostField.controlId"
                    [attr.aria-describedby]="lostField.describedBy()"
                    [attr.aria-invalid]="lostErrorText ? true : null"
                    [formField]="appForm.lostFeeDefault"
                    class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
                  />
                </ui-field>
              </div>

              <fieldset class="flex flex-col gap-2.5">
                <legend class="mb-1.5 text-[13px] font-semibold text-ink">
                  {{ 'settings.app.notifications' | transloco }}
                </legend>
                <label class="flex items-center gap-2.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    [formField]="appForm.notifyOnHoldReady"
                    class="size-4 rounded border-line accent-brand focus-ring"
                  />
                  {{ 'settings.app.notifyOnHoldReady' | transloco }}
                </label>
                <label class="flex items-center gap-2.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    [formField]="appForm.notifyOnOverdue"
                    class="size-4 rounded border-line accent-brand focus-ring"
                  />
                  {{ 'settings.app.notifyOnOverdue' | transloco }}
                </label>
                <label class="flex items-center gap-2.5 text-sm text-ink">
                  <input
                    type="checkbox"
                    [formField]="appForm.notifyOnPayment"
                    class="size-4 rounded border-line accent-brand focus-ring"
                  />
                  {{ 'settings.app.notifyOnPayment' | transloco }}
                </label>
              </fieldset>

              @if (appFormError(); as message) {
                <p role="alert" class="text-sm font-semibold text-danger">{{ message }}</p>
              }

              <div class="flex justify-end">
                <button uiBtn type="submit" [disabled]="store.saving() || appForm().invalid()">
                  {{
                    store.saving()
                      ? ('settings.app.saving' | transloco)
                      : ('settings.app.save' | transloco)
                  }}
                </button>
              </div>
            </form>
          </ui-card>
        }
      }
    </div>

    <ui-dialog
      [(open)]="typeDialogOpen"
      [heading]="
        (editingTypeId()
          ? 'settings.memberTypes.form.editHeading'
          : 'settings.memberTypes.form.addHeading'
        ) | transloco
      "
      [subtitle]="'settings.memberTypes.form.subtitle' | transloco"
      [closeLabel]="'settings.memberTypes.form.close' | transloco"
    >
      <form id="member-type-form" class="flex flex-col gap-4" (submit)="onTypeSubmit($event)" novalidate>
        @let typeNameKey = typeNameErrorKey();
        @let typeNameErrorText = typeNameKey ? (typeNameKey | transloco) : undefined;

        <ui-field
          [label]="'settings.memberTypes.form.name' | transloco"
          [error]="typeNameErrorText"
          [required]="true"
          #typeNameField
        >
          <input
            type="text"
            autocomplete="off"
            [id]="typeNameField.controlId"
            [attr.aria-describedby]="typeNameField.describedBy()"
            [attr.aria-invalid]="typeNameErrorText ? true : null"
            [formField]="typeForm.name"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        <div class="grid gap-4 sm:grid-cols-2">
          <ui-field
            [label]="'settings.memberTypes.form.loanPeriodDays' | transloco"
            [error]="numericTypeError('loanPeriodDays')"
            [required]="true"
            #loanPeriodField
          >
            <input
              type="number"
              step="1"
              inputmode="numeric"
              [id]="loanPeriodField.controlId"
              [attr.aria-describedby]="loanPeriodField.describedBy()"
              [attr.aria-invalid]="numericTypeError('loanPeriodDays') ? true : null"
              [formField]="typeForm.loanPeriodDays"
              class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
            />
          </ui-field>

          <ui-field
            [label]="'settings.memberTypes.form.renewalLimit' | transloco"
            [error]="numericTypeError('renewalLimit')"
            [required]="true"
            #renewalLimitField
          >
            <input
              type="number"
              step="1"
              inputmode="numeric"
              [id]="renewalLimitField.controlId"
              [attr.aria-describedby]="renewalLimitField.describedBy()"
              [attr.aria-invalid]="numericTypeError('renewalLimit') ? true : null"
              [formField]="typeForm.renewalLimit"
              class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
            />
          </ui-field>

          <ui-field
            [label]="'settings.memberTypes.form.borrowCap' | transloco"
            [error]="numericTypeError('borrowCap')"
            [required]="true"
            #borrowCapField
          >
            <input
              type="number"
              step="1"
              inputmode="numeric"
              [id]="borrowCapField.controlId"
              [attr.aria-describedby]="borrowCapField.describedBy()"
              [attr.aria-invalid]="numericTypeError('borrowCap') ? true : null"
              [formField]="typeForm.borrowCap"
              class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
            />
          </ui-field>

          <ui-field
            [label]="'settings.memberTypes.form.fineRatePerDay' | transloco"
            [error]="numericTypeError('fineRatePerDay')"
            [required]="true"
            #fineRateField
          >
            <input
              type="number"
              step="0.01"
              inputmode="decimal"
              [id]="fineRateField.controlId"
              [attr.aria-describedby]="fineRateField.describedBy()"
              [attr.aria-invalid]="numericTypeError('fineRatePerDay') ? true : null"
              [formField]="typeForm.fineRatePerDay"
              class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
            />
          </ui-field>

          <ui-field
            [label]="'settings.memberTypes.form.holdExpiryDays' | transloco"
            [error]="numericTypeError('holdExpiryDays')"
            [required]="true"
            #holdExpiryField
          >
            <input
              type="number"
              step="1"
              inputmode="numeric"
              [id]="holdExpiryField.controlId"
              [attr.aria-describedby]="holdExpiryField.describedBy()"
              [attr.aria-invalid]="numericTypeError('holdExpiryDays') ? true : null"
              [formField]="typeForm.holdExpiryDays"
              class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
            />
          </ui-field>
        </div>

        @if (typeFormError(); as message) {
          <p role="alert" class="text-sm font-semibold text-danger">{{ message }}</p>
        }
      </form>

      <div dialog-actions class="contents">
        <button uiBtn variant="outline" type="button" (click)="typeDialogOpen.set(false)">
          {{ 'settings.memberTypes.form.cancel' | transloco }}
        </button>
        <button
          uiBtn
          type="submit"
          form="member-type-form"
          [disabled]="store.saving() || typeForm().invalid()"
        >
          {{
            store.saving()
              ? ('settings.memberTypes.form.saving' | transloco)
              : editingTypeId()
                ? ('settings.memberTypes.form.save' | transloco)
                : ('settings.memberTypes.form.create' | transloco)
          }}
        </button>
      </div>
    </ui-dialog>

    <ui-dialog
      [(open)]="deleteDialogOpen"
      [heading]="'settings.memberTypes.deleteDialog.heading' | transloco"
      [closeLabel]="'settings.memberTypes.form.close' | transloco"
    >
      <p class="text-sm text-ink">
        {{
          'settings.memberTypes.deleteDialog.message'
            | transloco: { name: deletingType()?.name ?? '' }
        }}
      </p>

      @if (deleteError(); as message) {
        <p role="alert" class="mt-3 text-sm font-semibold text-danger">{{ message }}</p>
      }

      <div dialog-actions class="contents">
        <button uiBtn variant="outline" type="button" (click)="deleteDialogOpen.set(false)">
          {{ 'settings.memberTypes.deleteDialog.cancel' | transloco }}
        </button>
        <button uiBtn type="button" [disabled]="store.saving()" (click)="confirmTypeDelete()">
          {{
            store.saving()
              ? ('settings.memberTypes.form.saving' | transloco)
              : ('settings.memberTypes.deleteDialog.confirm' | transloco)
          }}
        </button>
      </div>
    </ui-dialog>
  `,
})
export class Settings implements OnInit {
  protected readonly store = inject(SettingsStore);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly typeDialogOpen = signal(false);
  protected readonly deleteDialogOpen = signal(false);
  protected readonly editingTypeId = signal<string | null>(null);
  protected readonly deletingType = signal<MemberType | null>(null);
  protected readonly typeFormError = signal<string | null>(null);
  protected readonly deleteError = signal<string | null>(null);
  protected readonly appFormError = signal<string | null>(null);

  private readonly typeModel = signal<MemberTypeFormValue>({ ...EMPTY_TYPE_FORM });
  protected readonly typeForm = form(this.typeModel, (path) => {
    required(path.name);
    // required() alone accepts all-whitespace; the store trims before saving.
    pattern(path.name, /\S/);
    required(path.loanPeriodDays);
    min(path.loanPeriodDays, 1);
    required(path.renewalLimit);
    min(path.renewalLimit, 0);
    required(path.borrowCap);
    min(path.borrowCap, 1);
    required(path.fineRatePerDay);
    min(path.fineRatePerDay, 0);
    required(path.holdExpiryDays);
    min(path.holdExpiryDays, 1);
  });

  private readonly appModel = signal<AppSettingsFormValue>({ ...EMPTY_APP_FORM });
  protected readonly appForm = form(this.appModel, (path) => {
    required(path.currency);
    pattern(path.currency, CURRENCY_PATTERN);
    required(path.timezone);
    validate(path.timezone, ({ value }) =>
      isValidTimeZone(value().trim()) ? null : { kind: 'timezone' },
    );
    required(path.defaultLocale);
    required(path.fineBlockThreshold);
    min(path.fineBlockThreshold, 0);
    required(path.damagedFeeDefault);
    min(path.damagedFeeDefault, 0);
    required(path.lostFeeDefault);
    min(path.lostFeeDefault, 0);
    required(path.defaultReportRangeDays);
  });

  protected readonly typeRowKey = (row: MemberType): string => row.id;

  /** Falls back to USD if a stored code is ever malformed — the pipe throws on bad codes. */
  protected readonly currencyCode = computed(() =>
    normalizeCurrency(this.store.appSettings()?.currency),
  );

  protected readonly typeColumns = computed((): TableColumn<MemberType>[] => [
    { key: 'name', header: this.transloco.translate('settings.memberTypes.columns.name') },
    {
      key: 'loanPeriod',
      header: this.transloco.translate('settings.memberTypes.columns.loanPeriod'),
    },
    {
      key: 'renewals',
      header: this.transloco.translate('settings.memberTypes.columns.renewals'),
    },
    {
      key: 'borrowCap',
      header: this.transloco.translate('settings.memberTypes.columns.borrowCap'),
    },
    {
      key: 'fineRate',
      header: this.transloco.translate('settings.memberTypes.columns.fineRate'),
    },
    {
      key: 'holdExpiry',
      header: this.transloco.translate('settings.memberTypes.columns.holdExpiry'),
    },
    {
      key: 'actions',
      header: this.transloco.translate('settings.memberTypes.columns.actions'),
      align: 'right',
    },
  ]);

  protected readonly localeOptions = computed((): SelectOption[] =>
    this.transloco.getAvailableLangs().map((lang) => {
      const id = typeof lang === 'string' ? lang : lang.id;
      return { value: id, label: this.transloco.translate(`settings.app.locales.${id}`) };
    }),
  );

  protected readonly reportRangeOptions = computed((): SelectOption[] =>
    REPORT_RANGE_OPTIONS.map((days) => ({
      value: days,
      label: this.transloco.translate('settings.memberTypes.days', { count: Number(days) }),
    })),
  );

  protected readonly typeNameErrorKey = computed(() => {
    const field = this.typeForm.name();
    if (!field.touched() || !field.invalid()) return undefined;
    return 'settings.memberTypes.form.errors.nameRequired';
  });

  protected readonly currencyErrorKey = computed(() => {
    const field = this.appForm.currency();
    if (!field.touched() || !field.invalid()) return undefined;
    return field.getError('pattern')
      ? 'settings.app.errors.currencyPattern'
      : 'settings.app.errors.currencyRequired';
  });

  protected readonly timezoneErrorKey = computed(() => {
    const field = this.appForm.timezone();
    if (!field.touched() || !field.invalid()) return undefined;
    return field.getError('timezone')
      ? 'settings.app.errors.timezoneInvalid'
      : 'settings.app.errors.timezoneRequired';
  });

  protected readonly thresholdErrorKey = computed(() => this.moneyErrorKey('fineBlockThreshold'));
  protected readonly damagedErrorKey = computed(() => this.moneyErrorKey('damagedFeeDefault'));
  protected readonly lostErrorKey = computed(() => this.moneyErrorKey('lostFeeDefault'));

  ngOnInit(): void {
    void this.store.init().then(() => {
      const settings = this.store.appSettings();
      if (settings) {
        this.appModel.set(toAppSettingsFormValue(settings));
      }
    });
  }

  /** One shared message per numeric rule field: empty (parse error) and below-min read the same. */
  protected numericTypeError(
    field: 'loanPeriodDays' | 'renewalLimit' | 'borrowCap' | 'fineRatePerDay' | 'holdExpiryDays',
  ): string | undefined {
    const state = this.typeForm[field]();
    if (!state.touched() || !state.invalid()) return undefined;
    return this.transloco.translate(`settings.memberTypes.form.errors.${field}`);
  }

  protected openTypeCreate(): void {
    this.editingTypeId.set(null);
    this.typeFormError.set(null);
    this.typeModel.set({ ...EMPTY_TYPE_FORM });
    this.typeDialogOpen.set(true);
  }

  protected openTypeEdit(row: MemberType): void {
    this.editingTypeId.set(row.id);
    this.typeFormError.set(null);
    this.typeModel.set(toMemberTypeFormValue(row));
    this.typeDialogOpen.set(true);
  }

  protected openTypeDelete(row: MemberType): void {
    this.deletingType.set(row);
    this.deleteError.set(null);
    this.deleteDialogOpen.set(true);
  }

  protected async onTypeSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.typeFormError.set(null);

    await submit(this.typeForm, async () => {
      const editing = this.editingTypeId();
      const result = await this.store.saveMemberType(editing, this.typeModel());
      if (result.error === 'load_failed') {
        this.typeDialogOpen.set(false);
        this.toast.error(this.transloco.translate('settings.errors.loadFailed'));
        return;
      }
      if (result.error && result.error !== 'audit_failed') {
        this.typeFormError.set(this.transloco.translate(MUTATION_ERROR_KEYS[result.error]));
        return;
      }
      this.typeDialogOpen.set(false);
      if (result.error === 'audit_failed') {
        this.toast.error(this.transloco.translate('settings.errors.auditFailed'));
        return;
      }
      this.toast.show(
        this.transloco.translate(
          editing ? 'settings.memberTypes.toasts.updated' : 'settings.memberTypes.toasts.created',
        ),
      );
    });
  }

  protected async confirmTypeDelete(): Promise<void> {
    const row = this.deletingType();
    if (!row) return;
    this.deleteError.set(null);

    const result = await this.store.removeMemberType(row.id);
    if (result.error === 'load_failed') {
      this.deleteDialogOpen.set(false);
      this.toast.error(this.transloco.translate('settings.errors.loadFailed'));
      return;
    }
    if (result.error && result.error !== 'audit_failed') {
      this.deleteError.set(this.transloco.translate(MUTATION_ERROR_KEYS[result.error]));
      return;
    }
    this.deleteDialogOpen.set(false);
    if (result.error === 'audit_failed') {
      this.toast.error(this.transloco.translate('settings.errors.auditFailed'));
      return;
    }
    this.toast.show(this.transloco.translate('settings.memberTypes.toasts.deleted'));
  }

  protected async onAppSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.appFormError.set(null);

    await submit(this.appForm, async () => {
      const result = await this.store.saveAppSettings(this.appModel());
      if (result.error && result.error !== 'audit_failed') {
        this.appFormError.set(this.transloco.translate(MUTATION_ERROR_KEYS[result.error]));
        return;
      }
      if (result.error === 'audit_failed') {
        this.toast.error(this.transloco.translate('settings.errors.auditFailed'));
        return;
      }
      this.toast.show(this.transloco.translate('settings.app.toasts.saved'));
    });
  }

  private moneyErrorKey(
    field: 'fineBlockThreshold' | 'damagedFeeDefault' | 'lostFeeDefault',
  ): string | undefined {
    const state = this.appForm[field]();
    if (!state.touched() || !state.invalid()) return undefined;
    return 'settings.app.errors.amountInvalid';
  }
}
