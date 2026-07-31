import { DatePipe } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { form, FormField, pattern, required, submit } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import { AuthService } from '../core/auth';
import {
  SelectOption,
  TableColumn,
  ToastService,
  UiAvatar,
  UiBadge,
  UiBtn,
  UiCellDef,
  UiDialog,
  UiEmptyState,
  UiField,
  UiPagination,
  UiSearchInput,
  UiSelect,
  UiSkeleton,
  UiTable,
  type BadgeTone,
} from '../ui';
import { MembersStore } from './members.store';
import {
  MEMBER_CARD_PATTERN,
  MEMBER_CARD_PREFIX,
  statusBadgeTone,
  type MemberFormValue,
  type MemberListItem,
  type MemberStatus,
} from './members.types';

const STATUS_LABEL_KEYS: Record<MemberStatus, string> = {
  active: 'members.status.active',
  suspended: 'members.status.suspended',
  blocked: 'members.status.blocked',
};

@Component({
  selector: 'app-members-list',
  providers: [MembersStore],
  imports: [
    DatePipe,
    FormField,
    TranslocoPipe,
    UiAvatar,
    UiBadge,
    UiBtn,
    UiCellDef,
    UiDialog,
    UiEmptyState,
    UiField,
    UiPagination,
    UiSearchInput,
    UiSelect,
    UiSkeleton,
    UiTable,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-[15px] font-bold text-ink-heading">
            {{ 'members.title' | transloco }}
          </h2>
          <p class="mt-0.5 text-[12.5px] text-ink-muted">
            {{ 'members.subtitle' | transloco: { count: store.total() } }}
          </p>
        </div>
        <button uiBtn type="button" (click)="openCreate()">
          {{ 'members.actions.add' | transloco }}
        </button>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <ui-search-input
          class="w-72 max-w-full"
          [placeholder]="'members.searchPlaceholder' | transloco"
          [value]="store.nameSearch()"
          (debouncedChange)="store.setNameSearch($event)"
        />
        <ui-select
          class="w-52"
          [options]="statusOptions()"
          [value]="store.statusFilter()"
          [ariaLabel]="'members.statusFilter' | transloco"
          (valueChange)="onStatusFilter($event)"
        />
      </div>

      @if (store.error()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'members.errors.loadFailed' | transloco }}
        </p>
      }

      @if (store.loading()) {
        <div role="status" aria-live="polite" class="flex flex-col gap-2.5">
          <span class="sr-only">{{ 'members.loading' | transloco }}</span>
          <ui-skeleton [rows]="5" />
        </div>
      } @else if (store.empty()) {
        <ui-empty-state
          [headline]="
            (store.hasActiveFilters()
              ? 'members.empty.filteredHeadline'
              : 'members.empty.headline'
            ) | transloco
          "
          [message]="
            (store.hasActiveFilters()
              ? 'members.empty.filteredMessage'
              : 'members.empty.message'
            ) | transloco
          "
        >
          @if (store.hasActiveFilters()) {
            <button uiBtn variant="outline" type="button" (click)="store.clearFilters()">
              {{ 'members.actions.clearFilters' | transloco }}
            </button>
          } @else {
            <button uiBtn type="button" (click)="openCreate()">
              {{ 'members.actions.add' | transloco }}
            </button>
          }
        </ui-empty-state>
      } @else {
        <ui-table
          [caption]="'members.tableCaption' | transloco"
          [columns]="columns()"
          [rows]="store.rows()"
          [rowKey]="rowKey"
          minWidth="56rem"
        >
          <ng-template uiCell="name" let-row>
            <span class="flex items-center gap-2.5">
              <ui-avatar [name]="row.name" [size]="28" />
              <span class="flex flex-col">
                <span class="font-semibold text-ink">{{ row.name }}</span>
                <span class="text-[12px] text-ink-muted">{{ row.card_barcode }}</span>
              </span>
            </span>
          </ng-template>
          <ng-template uiCell="type" let-row>
            <span uiBadge [tone]="typeTone(row.member_type?.name)">
              {{ row.member_type?.name ?? ('members.unknownType' | transloco) }}
            </span>
          </ng-template>
          <ng-template uiCell="joined" let-row>
            {{ row.joined_at | date: 'MMM d, y' }}
          </ng-template>
          <ng-template uiCell="status" let-row>
            <span uiBadge [tone]="statusBadgeTone(row.status)">
              {{ statusLabel(row.status) }}
            </span>
          </ng-template>
          <ng-template uiCell="actions" let-row>
            <div class="flex flex-wrap items-center justify-end gap-2">
              <button
                uiBtn
                variant="pill-muted"
                type="button"
                (click)="openEdit(row)"
              >
                {{ 'members.actions.edit' | transloco }}
              </button>
              @for (action of statusActions(row); track action.status) {
                <button
                  uiBtn
                  variant="pill"
                  type="button"
                  [disabled]="store.saving()"
                  (click)="onStatusAction(row, action.status)"
                >
                  {{ action.labelKey | transloco }}
                </button>
              }
            </div>
          </ng-template>
        </ui-table>

        <ui-pagination
          [page]="store.page()"
          [pageSize]="store.pageSize"
          [total]="store.total()"
          [prevLabel]="'members.pagination.prev' | transloco"
          [nextLabel]="'members.pagination.next' | transloco"
          [navLabel]="'members.pagination.nav' | transloco"
          [summary]="paginationSummary"
          (pageChange)="store.setPage($event)"
        />
      }
    </div>

    <ui-dialog
      [(open)]="formOpen"
      [heading]="
        (editingId() ? 'members.form.editHeading' : 'members.form.addHeading') | transloco
      "
      [subtitle]="'members.form.subtitle' | transloco"
      [closeLabel]="'members.form.close' | transloco"
    >
      <form id="member-form" class="flex flex-col gap-4" (submit)="onFormSubmit($event)" novalidate>
        @let nameKey = nameErrorKey();
        @let nameErrorText = nameKey ? (nameKey | transloco) : undefined;
        @let typeKey = typeErrorKey();
        @let typeErrorText = typeKey ? (typeKey | transloco) : undefined;
        @let barcodeKey = barcodeErrorKey();
        @let barcodeErrorText = barcodeKey ? (barcodeKey | transloco) : undefined;

        <ui-field
          [label]="'members.form.name' | transloco"
          [error]="nameErrorText"
          [required]="true"
          #nameField
        >
          <input
            type="text"
            autocomplete="name"
            [id]="nameField.controlId"
            [attr.aria-describedby]="nameField.describedBy()"
            [attr.aria-invalid]="nameErrorText ? true : null"
            [formField]="memberForm.name"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        <ui-field
          [label]="'members.form.memberType' | transloco"
          [error]="typeErrorText"
          [required]="true"
          #typeField
        >
          <select
            [id]="typeField.controlId"
            [attr.aria-describedby]="typeField.describedBy()"
            [attr.aria-invalid]="typeErrorText ? true : null"
            [formField]="memberForm.memberTypeId"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          >
            <option value="">{{ 'members.form.memberTypePlaceholder' | transloco }}</option>
            @for (type of store.memberTypes(); track type.id) {
              <option [value]="type.id">{{ type.name }}</option>
            }
          </select>
        </ui-field>

        <ui-field
          [label]="'members.form.cardBarcode' | transloco"
          [hint]="'members.form.cardBarcodeHint' | transloco"
          [error]="barcodeErrorText"
          [required]="true"
          #barcodeField
        >
          <input
            type="text"
            autocomplete="off"
            spellcheck="false"
            [id]="barcodeField.controlId"
            [attr.aria-describedby]="barcodeField.describedBy()"
            [attr.aria-invalid]="barcodeErrorText ? true : null"
            [formField]="memberForm.cardBarcode"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 font-mono text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        <ui-field [label]="'members.form.email' | transloco" #emailField>
          <input
            type="email"
            autocomplete="email"
            [id]="emailField.controlId"
            [attr.aria-describedby]="emailField.describedBy()"
            [formField]="memberForm.email"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        <ui-field [label]="'members.form.phone' | transloco" #phoneField>
          <input
            type="tel"
            autocomplete="tel"
            [id]="phoneField.controlId"
            [attr.aria-describedby]="phoneField.describedBy()"
            [formField]="memberForm.phone"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        @if (formError(); as message) {
          <p role="alert" class="text-sm font-semibold text-danger">{{ message }}</p>
        }
      </form>

      <div dialog-actions class="contents">
        <button uiBtn variant="outline" type="button" (click)="formOpen.set(false)">
          {{ 'members.form.cancel' | transloco }}
        </button>
        <button
          uiBtn
          type="submit"
          form="member-form"
          [disabled]="store.saving() || memberForm().invalid()"
        >
          {{
            store.saving()
              ? ('members.form.saving' | transloco)
              : editingId()
                ? ('members.form.save' | transloco)
                : ('members.form.create' | transloco)
          }}
        </button>
      </div>
    </ui-dialog>
  `,
})
export class MembersList {
  protected readonly store = inject(MembersStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly formOpen = signal(false);
  protected readonly editingId = signal<string | null>(null);
  protected readonly formError = signal<string | null>(null);

  private readonly model = signal<MemberFormValue>({
    name: '',
    memberTypeId: '',
    email: '',
    phone: '',
    cardBarcode: `${MEMBER_CARD_PREFIX}`,
  });

  protected readonly memberForm = form(this.model, (path) => {
    required(path.name);
    required(path.memberTypeId);
    required(path.cardBarcode);
    pattern(path.cardBarcode, MEMBER_CARD_PATTERN);
  });

  protected readonly statusBadgeTone = statusBadgeTone;
  protected readonly rowKey = (row: MemberListItem) => row.id;

  protected readonly statusOptions = computed<SelectOption[]>(() => [
    { value: 'all', label: this.transloco.translate('members.status.all') },
    ... (Object.keys(STATUS_LABEL_KEYS) as MemberStatus[]).map((status) => ({
      value: status,
      label: this.transloco.translate(STATUS_LABEL_KEYS[status]),
    })),
  ]);

  protected readonly columns = computed<TableColumn<MemberListItem>[]>(() => [
    {
      key: 'name',
      header: this.transloco.translate('members.columns.name'),
      sortable: false,
    },
    {
      key: 'type',
      header: this.transloco.translate('members.columns.type'),
      width: '8rem',
    },
    {
      key: 'joined',
      header: this.transloco.translate('members.columns.joined'),
      width: '8rem',
    },
    {
      key: 'status',
      header: this.transloco.translate('members.columns.status'),
      width: '7rem',
    },
    {
      key: 'actions',
      header: this.transloco.translate('members.columns.actions'),
      align: 'right',
      width: '16rem',
    },
  ]);

  protected readonly paginationSummary = (range: {
    from: number;
    to: number;
    total: number;
  }) =>
    this.transloco.translate('members.pagination.summary', {
      from: range.from,
      to: range.to,
      total: range.total,
    });

  protected readonly nameErrorKey = computed(() => {
    const field = this.memberForm.name();
    if (!field.touched() || !field.invalid()) return undefined;
    return 'members.form.errors.nameRequired';
  });

  protected readonly typeErrorKey = computed(() => {
    const field = this.memberForm.memberTypeId();
    if (!field.touched() || !field.invalid()) return undefined;
    return 'members.form.errors.typeRequired';
  });

  protected readonly barcodeErrorKey = computed(() => {
    const field = this.memberForm.cardBarcode();
    if (!field.touched() || !field.invalid()) return undefined;
    return field.getError('pattern')
      ? 'members.form.errors.cardBarcodePattern'
      : 'members.form.errors.cardBarcodeRequired';
  });

  constructor() {
    void this.store.init();
  }

  protected statusLabel(status: MemberStatus): string {
    return this.transloco.translate(STATUS_LABEL_KEYS[status]);
  }

  protected typeTone(name: string | undefined): BadgeTone {
    switch (name) {
      case 'Student':
        return 'info';
      case 'Senior':
        return 'pink';
      case 'Adult':
        return 'purple';
      default:
        return 'neutral';
    }
  }

  protected statusActions(
    row: MemberListItem,
  ): { status: MemberStatus; labelKey: string }[] {
    const admin = this.auth.isAdmin();
    switch (row.status) {
      case 'active':
        return [
          { status: 'suspended', labelKey: 'members.actions.suspend' },
          ...(admin ? [{ status: 'blocked' as const, labelKey: 'members.actions.block' }] : []),
        ];
      case 'suspended':
        return [
          { status: 'active', labelKey: 'members.actions.lift' },
          ...(admin ? [{ status: 'blocked' as const, labelKey: 'members.actions.block' }] : []),
        ];
      case 'blocked':
        return admin
          ? [{ status: 'active', labelKey: 'members.actions.unblock' }]
          : [];
      default: {
        const _exhaustive: never = row.status;
        return _exhaustive;
      }
    }
  }

  protected onStatusFilter(value: string): void {
    if (value === 'all' || value === 'active' || value === 'suspended' || value === 'blocked') {
      this.store.setStatusFilter(value);
    }
  }

  protected openCreate(): void {
    this.editingId.set(null);
    this.formError.set(null);
    this.model.set({
      name: '',
      memberTypeId: this.store.memberTypes()[0]?.id ?? '',
      email: '',
      phone: '',
      cardBarcode: `${MEMBER_CARD_PREFIX}`,
    });
    this.formOpen.set(true);
  }

  protected openEdit(row: MemberListItem): void {
    this.editingId.set(row.id);
    this.formError.set(null);
    this.model.set({
      name: row.name,
      memberTypeId: row.member_type_id,
      email: row.email ?? '',
      phone: row.phone ?? '',
      cardBarcode: row.card_barcode,
    });
    this.formOpen.set(true);
  }

  protected async onStatusAction(row: MemberListItem, status: MemberStatus): Promise<void> {
    const { error } = await this.store.setMemberStatus(row.id, status);
    if (error === 'load_failed') {
      this.toast.error(this.transloco.translate('members.errors.loadFailed'));
      return;
    }
    if (error) {
      this.toast.error(this.transloco.translate('members.toasts.statusFailed'));
      return;
    }
    this.toast.show(this.transloco.translate('members.toasts.statusUpdated'));
  }

  protected async onFormSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.formError.set(null);

    await submit(this.memberForm, async () => {
      const value = this.model();
      const editing = this.editingId();
      const result = editing
        ? await this.store.updateMember(editing, value)
        : await this.store.createMember(value);
      if (result.error === 'load_failed') {
        this.formOpen.set(false);
        this.toast.error(this.transloco.translate('members.errors.loadFailed'));
        return;
      }
      if (result.error && result.error !== 'audit_failed') {
        this.formError.set(this.transloco.translate('members.form.errors.saveFailed'));
        return;
      }
      this.formOpen.set(false);
      if (result.error === 'audit_failed') {
        this.toast.error(this.transloco.translate('members.toasts.auditFailed'));
        return;
      }
      this.toast.show(
        this.transloco.translate(
          editing ? 'members.toasts.updated' : 'members.toasts.created',
        ),
      );
    });
  }
}
