import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { form, FormField, min, required, submit } from '@angular/forms/signals';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { LucideAngularModule } from 'lucide-angular';

import { AuthService } from '../core/auth';
import {
  ToastService,
  UiBadge,
  UiBtn,
  UiDialog,
  UiEmptyState,
  UiField,
  UiPagination,
  UiSearchInput,
  UiSelect,
  type SelectOption,
  type TableColumn,
  UiCellDef,
  UiTable,
} from '../ui';
import type { BadgeTone } from '../ui';
import { CatalogStore } from './catalog.store';
import { generateCopyBarcode } from './catalog.barcodes';
import type {
  CatalogMutationError,
  CatalogTitle,
  CopyStatus,
  TitleCopySummary,
} from './catalog.types';

interface AddTitleModel {
  title: string;
  author: string;
  genre: string;
  isbn: string;
  description: string;
  copyCount: number;
}

const MUTATION_ERROR_KEYS: Record<CatalogMutationError, string> = {
  isbn_taken: 'catalog.errors.isbnTaken',
  barcode_taken: 'catalog.errors.barcodeTaken',
  barcode_invalid: 'catalog.errors.barcodeInvalid',
  copy_on_loan: 'catalog.errors.copyOnLoan',
  admin_required: 'catalog.errors.adminRequired',
  invalid_status_transition: 'catalog.errors.invalidTransition',
  copy_not_found: 'catalog.errors.copyNotFound',
  unexpected: 'catalog.errors.unexpected',
};

const STATUS_TONE: Record<CopyStatus, 'success' | 'info' | 'warning' | 'danger' | 'neutral'> = {
  available: 'success',
  on_loan: 'info',
  on_hold_shelf: 'warning',
  lost: 'danger',
  damaged: 'warning',
  retired: 'neutral',
};

@Component({
  selector: 'app-catalog',
  imports: [
    FormField,
    TranslocoPipe,
    LucideAngularModule,
    UiBadge,
    UiBtn,
    UiCellDef,
    UiDialog,
    UiEmptyState,
    UiField,
    UiPagination,
    UiSearchInput,
    UiSelect,
    UiTable,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div class="flex flex-wrap items-end justify-between gap-4">
        <div class="flex min-w-0 flex-1 flex-wrap items-end gap-3">
          <div class="w-full max-w-sm">
            <ui-search-input
              [placeholder]="'catalog.searchPlaceholder' | transloco"
              [ariaLabel]="'catalog.searchLabel' | transloco"
              [value]="store.search()"
              (debouncedChange)="onSearch($event)"
              (submitted)="onSearch($event)"
            />
          </div>
          <div class="w-44">
            <ui-select
              [options]="genreOptions()"
              [ariaLabel]="'catalog.genreFilter' | transloco"
              [value]="store.genre()"
              (valueChange)="onGenre($event)"
            />
          </div>
        </div>
        <div class="flex items-center gap-4">
          <p class="text-[13px] text-ink-muted" aria-live="polite">
            {{ 'catalog.resultCount' | transloco: { count: store.total() } }}
          </p>
          <button uiBtn type="button" (click)="openAddTitle()">
            <lucide-angular name="plus" [size]="16" [strokeWidth]="2" aria-hidden="true" />
            {{ 'catalog.addTitle' | transloco }}
          </button>
        </div>
      </div>

      @if (store.error()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'catalog.errors.loadFailed' | transloco }}
        </p>
      }

      @if (store.isEmpty()) {
        <div class="rounded-card border border-line bg-surface shadow-tab">
          <ui-empty-state
            [headline]="
              (store.hasActiveFilters()
                ? 'catalog.empty.filteredHeadline'
                : 'catalog.empty.headline'
              ) | transloco
            "
            [message]="
              (store.hasActiveFilters()
                ? 'catalog.empty.filteredMessage'
                : 'catalog.empty.message'
              ) | transloco
            "
          >
            @if (store.hasActiveFilters()) {
              <button uiBtn variant="outline" type="button" (click)="clearFilters()">
                {{ 'catalog.clearFilters' | transloco }}
              </button>
            } @else {
              <button uiBtn type="button" (click)="openAddTitle()">
                {{ 'catalog.addTitle' | transloco }}
              </button>
            }
          </ui-empty-state>
        </div>
      } @else {
        <ui-table
          [columns]="columns"
          [rows]="store.rows()"
          [rowKey]="rowId"
          [caption]="'catalog.tableCaption' | transloco"
          minWidth="56rem"
        >
          <ng-template uiCell="title" let-row>
            <div class="font-semibold text-ink">{{ row.title }}</div>
            <div class="text-[12.5px] text-ink-muted">{{ row.author }}</div>
          </ng-template>
            <ng-template uiCell="genre" let-row>
              <span uiBadge [tone]="genreTone(row.genre)">{{ row.genre }}</span>
            </ng-template>
          <ng-template uiCell="availability" let-row>
            <span
              uiBadge
              [tone]="row.availableCount === 0 ? 'danger' : 'success'"
              [attr.aria-label]="
                'catalog.availabilityLabel'
                  | transloco: { available: row.availableCount, total: row.totalCount }
              "
            >
              {{ row.availableCount }} / {{ row.totalCount }}
            </span>
          </ng-template>
          <ng-template uiCell="actions" let-row>
            <button uiBtn variant="pill" type="button" (click)="openCopies(row)">
              {{ 'catalog.manageCopies' | transloco }}
            </button>
          </ng-template>
        </ui-table>
        <div class="mt-4">
          <ui-pagination
            [page]="store.page()"
            [pageSize]="store.pageSize()"
            [total]="store.total()"
            [prevLabel]="'catalog.pagination.prev' | transloco"
            [nextLabel]="'catalog.pagination.next' | transloco"
            [navLabel]="'catalog.pagination.nav' | transloco"
            [summary]="paginationSummary"
            (pageChange)="onPage($event)"
          />
        </div>
      }
    </div>

    <ui-dialog
      [(open)]="addOpen"
      [heading]="'catalog.addDialog.heading' | transloco"
      [subtitle]="'catalog.addDialog.subtitle' | transloco"
      [closeLabel]="'catalog.dialogClose' | transloco"
    >
      <form class="flex flex-col gap-2" (submit)="onAddSubmit($event)" novalidate>
        @let titleErrKey = titleErrorKey();
        @let titleErrorText = titleErrKey ? (titleErrKey | transloco) : undefined;
        @let authorKey = authorErrorKey();
        @let authorErrorText = authorKey ? (authorKey | transloco) : undefined;
        @let genreKey = genreErrorKey();
        @let genreErrorText = genreKey ? (genreKey | transloco) : undefined;

        <ui-field
          [label]="'catalog.fields.title' | transloco"
          [error]="titleErrorText"
          [required]="true"
          #titleField
        >
          <input
            type="text"
            [id]="titleField.controlId"
            [attr.aria-describedby]="titleField.describedBy()"
            [attr.aria-invalid]="titleErrorText ? true : null"
            [formField]="addForm.title"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        <ui-field
          [label]="'catalog.fields.author' | transloco"
          [error]="authorErrorText"
          [required]="true"
          #authorField
        >
          <input
            type="text"
            [id]="authorField.controlId"
            [attr.aria-describedby]="authorField.describedBy()"
            [attr.aria-invalid]="authorErrorText ? true : null"
            [formField]="addForm.author"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        <ui-field
          [label]="'catalog.fields.genre' | transloco"
          [error]="genreErrorText"
          [required]="true"
          #genreField
        >
          <input
            type="text"
            [id]="genreField.controlId"
            [attr.aria-describedby]="genreField.describedBy()"
            [attr.aria-invalid]="genreErrorText ? true : null"
            [formField]="addForm.genre"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        <ui-field
          [label]="'catalog.fields.isbn' | transloco"
          [hint]="'catalog.fields.isbnHint' | transloco"
          #isbnField
        >
          <input
            type="text"
            inputmode="numeric"
            autocomplete="off"
            [id]="isbnField.controlId"
            [attr.aria-describedby]="isbnField.describedBy()"
            [formField]="addForm.isbn"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        <ui-field [label]="'catalog.fields.description' | transloco" #descriptionField>
          <textarea
            rows="3"
            [id]="descriptionField.controlId"
            [attr.aria-describedby]="descriptionField.describedBy()"
            [formField]="addForm.description"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          ></textarea>
        </ui-field>

        <ui-field
          [label]="'catalog.fields.copyCount' | transloco"
          [hint]="'catalog.fields.copyCountHint' | transloco"
          [required]="true"
          #copyCountField
        >
          <input
            type="number"
            step="1"
            inputmode="numeric"
            [id]="copyCountField.controlId"
            [attr.aria-describedby]="copyCountField.describedBy()"
            [formField]="addForm.copyCount"
            (keydown)="rejectNonPositiveCopyCount($event)"
            (input)="clampCopyCount($event)"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        @if (addError(); as message) {
          <p role="alert" class="text-sm font-semibold text-danger">{{ message }}</p>
        }

        <div dialog-actions class="flex justify-end gap-3">
          <button uiBtn variant="outline" type="button" (click)="addOpen.set(false)">
            {{ 'catalog.cancel' | transloco }}
          </button>
          <button uiBtn type="submit" [disabled]="adding() || addForm().invalid()">
            {{ adding() ? ('catalog.saving' | transloco) : ('catalog.addTitle' | transloco) }}
          </button>
        </div>
      </form>
    </ui-dialog>

    <ui-dialog
      [(open)]="copiesOpen"
      [heading]="selectedTitle()?.title ?? ('catalog.copiesDialog.heading' | transloco)"
      [subtitle]="'catalog.copiesDialog.subtitle' | transloco"
      [closeLabel]="'catalog.dialogClose' | transloco"
    >
      @if (selectedTitle(); as title) {
        <ul class="flex flex-col gap-3" role="list">
          @for (copy of title.copies; track copy.id) {
            <li class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line px-4 py-3">
              <div class="min-w-0">
                <div class="font-semibold text-ink">{{ copy.barcode }}</div>
                <span uiBadge [tone]="statusTone(copy.status)" class="mt-1">
                  {{ statusLabel(copy.status) }}
                </span>
              </div>
              <div class="flex flex-wrap gap-2">
                @for (action of actionsFor(copy); track action.status) {
                  <button
                    uiBtn
                    [variant]="action.danger ? 'pill-muted' : 'pill'"
                    type="button"
                    [disabled]="statusBusy() === copy.id"
                    (click)="onStatusAction(copy, action.status)"
                  >
                    {{ action.labelKey | transloco }}
                  </button>
                }
                <button
                  uiBtn
                  variant="pill-muted"
                  type="button"
                  (click)="openEditCopy(copy)"
                >
                  {{ 'catalog.editCopy' | transloco }}
                </button>
              </div>
            </li>
          }
        </ul>
      }
    </ui-dialog>

    <ui-dialog
      [(open)]="editOpen"
      [heading]="'catalog.editDialog.heading' | transloco"
      [closeLabel]="'catalog.dialogClose' | transloco"
    >
      <form class="flex flex-col gap-2" (submit)="onEditSubmit($event)" novalidate>
        <ui-field
          [label]="'catalog.fields.barcode' | transloco"
          [hint]="'catalog.fields.barcodeHint' | transloco"
          [required]="true"
          [error]="editBarcodeError()"
          #barcodeField
        >
          <input
            type="text"
            autocomplete="off"
            spellcheck="false"
            [id]="barcodeField.controlId"
            [attr.aria-describedby]="barcodeField.describedBy()"
            [attr.aria-invalid]="editBarcodeError() ? true : null"
            [value]="editBarcode()"
            (input)="onEditBarcodeInput($event)"
            class="w-full rounded-lg border border-line bg-surface px-3.5 py-2.5 text-sm text-ink focus-ring focus:border-brand"
          />
        </ui-field>

        @if (editError(); as message) {
          <p role="alert" class="text-sm font-semibold text-danger">{{ message }}</p>
        }

        <div dialog-actions class="flex justify-end gap-3">
          <button uiBtn variant="outline" type="button" (click)="editOpen.set(false)">
            {{ 'catalog.cancel' | transloco }}
          </button>
          <button uiBtn type="submit" [disabled]="editing()">
            {{ editing() ? ('catalog.saving' | transloco) : ('catalog.save' | transloco) }}
          </button>
        </div>
      </form>
    </ui-dialog>
  `,
})
export class Catalog implements OnInit {
  protected readonly store = inject(CatalogStore);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly transloco = inject(TranslocoService);

  protected readonly addOpen = signal(false);
  protected readonly copiesOpen = signal(false);
  protected readonly editOpen = signal(false);
  protected readonly selectedTitle = signal<CatalogTitle | null>(null);
  protected readonly editingCopy = signal<TitleCopySummary | null>(null);
  protected readonly editBarcode = signal('');
  protected readonly editBarcodeError = signal<string | undefined>(undefined);
  protected readonly addError = signal<string | null>(null);
  protected readonly editError = signal<string | null>(null);
  protected readonly adding = signal(false);
  protected readonly editing = signal(false);
  protected readonly statusBusy = signal<string | null>(null);

  private readonly addModel = signal<AddTitleModel>({
    title: '',
    author: '',
    genre: '',
    isbn: '',
    description: '',
    copyCount: 1,
  });

  protected readonly addForm = form(this.addModel, (path) => {
    required(path.title);
    required(path.author);
    required(path.genre);
    required(path.copyCount);
    min(path.copyCount, 1);
  });

  protected readonly columns: TableColumn<CatalogTitle>[] = [
    { key: 'title', header: '', width: '28%' },
    { key: 'genre', header: '', width: '16%' },
    { key: 'isbn', header: '', width: '18%', value: (row) => row.isbn ?? '—' },
    { key: 'availability', header: '', width: '16%' },
    { key: 'actions', header: '', width: '22%', align: 'right' },
  ];

  protected readonly genreOptions = computed<SelectOption[]>(() => [
    { label: this.transloco.translate('catalog.allGenres'), value: '' },
    ...this.store.genres().map((g) => ({ label: g, value: g })),
  ]);

  protected readonly rowId = (row: CatalogTitle) => row.id;

  protected readonly paginationSummary = (range: {
    from: number;
    to: number;
    total: number;
  }): string =>
    this.transloco.translate('catalog.pagination.summary', range);

  protected readonly titleErrorKey = computed(() => {
    const field = this.addForm.title();
    if (!field.touched() || !field.invalid()) return undefined;
    return 'catalog.errors.titleRequired';
  });

  protected readonly authorErrorKey = computed(() => {
    const field = this.addForm.author();
    if (!field.touched() || !field.invalid()) return undefined;
    return 'catalog.errors.authorRequired';
  });

  protected readonly genreErrorKey = computed(() => {
    const field = this.addForm.genre();
    if (!field.touched() || !field.invalid()) return undefined;
    return 'catalog.errors.genreRequired';
  });

  ngOnInit(): void {
    this.columns[0]!.header = this.transloco.translate('catalog.columns.title');
    this.columns[1]!.header = this.transloco.translate('catalog.columns.genre');
    this.columns[2]!.header = this.transloco.translate('catalog.columns.isbn');
    this.columns[3]!.header = this.transloco.translate('catalog.columns.availability');
    this.columns[4]!.header = this.transloco.translate('catalog.columns.actions');
    void this.store.load();
  }

  protected statusTone(status: CopyStatus) {
    return STATUS_TONE[status];
  }

  protected genreTone(genre: string): BadgeTone {
    const key = genre.trim().toLowerCase();
    switch (key) {
      case 'sci-fi':
      case 'science fiction':
        return 'warning';
      case 'fiction':
        return 'info';
      case 'non-fiction':
      case 'nonfiction':
        return 'pink';
      case "children's":
      case 'children':
      case 'kids':
        return 'purple';
      default:
        return 'neutral';
    }
  }

  protected statusLabel(status: CopyStatus): string {
    return this.transloco.translate(`catalog.status.${status}`);
  }

  protected onEditBarcodeInput(event: Event): void {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    this.editBarcode.set(target.value);
  }

  protected actionsFor(
    copy: TitleCopySummary,
  ): { status: CopyStatus; labelKey: string; danger?: boolean }[] {
    const admin = this.auth.isAdmin();
    switch (copy.status) {
      case 'available':
      case 'on_hold_shelf':
        return [
          { status: 'lost', labelKey: 'catalog.actions.markLost', danger: true },
          { status: 'damaged', labelKey: 'catalog.actions.markDamaged' },
          ...(admin
            ? [{ status: 'retired' as const, labelKey: 'catalog.actions.retire', danger: true }]
            : []),
        ];
      case 'lost':
      case 'damaged':
        return [{ status: 'available', labelKey: 'catalog.actions.markAvailable' }];
      case 'retired':
        return admin
          ? [{ status: 'available', labelKey: 'catalog.actions.unretire' }]
          : [];
      case 'on_loan':
        return [];
      default: {
        const _exhaustive: never = copy.status;
        return _exhaustive;
      }
    }
  }

  protected async onSearch(value: string): Promise<void> {
    await this.store.applySearch(value);
  }

  protected async onGenre(value: string): Promise<void> {
    await this.store.applyGenre(value);
  }

  protected async onPage(page: number): Promise<void> {
    await this.store.applyPage(page);
  }

  protected async clearFilters(): Promise<void> {
    await this.store.clearFilters();
  }

  protected rejectNonPositiveCopyCount(event: KeyboardEvent): void {
    if (event.key === '-' || event.key === '+' || event.key === 'e' || event.key === 'E') {
      event.preventDefault();
    }
  }

  protected clampCopyCount(event: Event): void {
    const el = event.target as HTMLInputElement;
    if (el.value === '') return;
    const n = Number(el.value);
    if (Number.isFinite(n) && n >= 1) return;
    el.value = '1';
    this.addModel.update((current) => ({ ...current, copyCount: 1 }));
  }

  protected openAddTitle(): void {
    this.addModel.set({
      title: '',
      author: '',
      genre: '',
      isbn: '',
      description: '',
      copyCount: 1,
    });
    this.addError.set(null);
    this.addOpen.set(true);
  }

  protected openCopies(row: CatalogTitle): void {
    this.selectedTitle.set(row);
    this.copiesOpen.set(true);
  }

  protected openEditCopy(copy: TitleCopySummary): void {
    this.editingCopy.set(copy);
    this.editBarcode.set(copy.barcode);
    this.editBarcodeError.set(undefined);
    this.editError.set(null);
    this.editOpen.set(true);
  }

  protected async onAddSubmit(event: Event): Promise<void> {
    event.preventDefault();
    this.addError.set(null);
    await submit(this.addForm, async () => {
      this.adding.set(true);
      try {
        const model = this.addModel();
        const count = Math.min(50, Math.max(1, Number(model.copyCount) || 1));
        const barcodes = Array.from({ length: count }, () => generateCopyBarcode());
        const result = await this.store.addTitle({
          title: model.title,
          author: model.author,
          genre: model.genre,
          isbn: model.isbn.trim() || null,
          description: model.description.trim() || null,
          replacement_cost: null,
          barcodes,
        });
        if (!result.ok) {
          this.addError.set(this.transloco.translate(MUTATION_ERROR_KEYS[result.error]));
          return;
        }
        this.addOpen.set(false);
        this.toast.show(this.transloco.translate('catalog.toasts.titleAdded'));
      } finally {
        this.adding.set(false);
      }
    });
  }

  protected async onEditSubmit(event: Event): Promise<void> {
    event.preventDefault();
    const copy = this.editingCopy();
    if (!copy) return;
    const barcode = this.editBarcode().trim();
    this.editBarcodeError.set(undefined);
    this.editError.set(null);
    if (!barcode) {
      this.editBarcodeError.set(this.transloco.translate('catalog.errors.barcodeRequired'));
      return;
    }
    if (!barcode.startsWith('BK-')) {
      this.editBarcodeError.set(this.transloco.translate('catalog.errors.barcodeInvalid'));
      return;
    }
    this.editing.set(true);
    try {
      const result = await this.store.editCopy({ copyId: copy.id, barcode });
      if (!result.ok) {
        this.editError.set(this.transloco.translate(MUTATION_ERROR_KEYS[result.error]));
        return;
      }
      this.editOpen.set(false);
      this.toast.show(this.transloco.translate('catalog.toasts.copyUpdated'));
      const refreshed = this.store.rows().find((r) => r.id === this.selectedTitle()?.id) ?? null;
      this.selectedTitle.set(refreshed);
    } finally {
      this.editing.set(false);
    }
  }

  protected async onStatusAction(copy: TitleCopySummary, status: CopyStatus): Promise<void> {
    this.statusBusy.set(copy.id);
    try {
      const result = await this.store.setCopyStatus(copy.id, status);
      if (!result.ok) {
        this.toast.error(this.transloco.translate(MUTATION_ERROR_KEYS[result.error]));
        return;
      }
      this.toast.show(this.transloco.translate('catalog.toasts.statusUpdated'));
      const refreshed = this.store.rows().find((r) => r.id === this.selectedTitle()?.id) ?? null;
      this.selectedTitle.set(refreshed);
    } finally {
      this.statusBusy.set(null);
    }
  }
}
