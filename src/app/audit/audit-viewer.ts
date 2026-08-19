import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';

import {
  DateRangePreset,
  DateRangeValue,
  SelectOption,
  TableColumn,
  UiBtn,
  UiCellDef,
  UiDateRange,
  UiDialog,
  UiEmptyState,
  UiField,
  UiPagination,
  UiSelect,
  UiSkeleton,
  UiTable,
} from '../ui';
import { AuditStore } from './audit.store';
import {
  AUDIT_ACTION_CODES,
  AUDIT_ENTITY_TYPES,
  auditActionLabelKey,
  highlightJson,
  type AuditListItem,
  type JsonHighlightKind,
} from './audit.types';

@Component({
  selector: 'app-audit-viewer',
  providers: [AuditStore],
  imports: [
    DatePipe,
    TranslocoPipe,
    UiBtn,
    UiCellDef,
    UiDateRange,
    UiDialog,
    UiEmptyState,
    UiField,
    UiPagination,
    UiSelect,
    UiSkeleton,
    UiTable,
  ],
  template: `
    <div class="flex flex-col gap-6">
      <div>
        <h2 class="text-[15px] font-bold text-ink-heading">
          {{ 'audit.title' | transloco }}
        </h2>
        <p class="mt-0.5 text-[12.5px] text-ink-muted">
          {{ 'audit.subtitle' | transloco: { count: store.total() } }}
        </p>
      </div>

      <div
        class="flex flex-wrap items-end gap-3"
        role="search"
        [attr.aria-label]="'audit.filtersLabel' | transloco"
      >
        <ui-field class="w-52 max-w-full" [label]="'audit.filters.actor' | transloco" #actorField>
          <ui-select
            [controlId]="actorField.controlId"
            [options]="actorOptions()"
            [value]="store.actorId()"
            (valueChange)="store.setActorId($event || 'all')"
          />
        </ui-field>
        <ui-field class="w-52 max-w-full" [label]="'audit.filters.action' | transloco" #actionField>
          <ui-select
            [controlId]="actionField.controlId"
            [options]="actionOptions()"
            [value]="store.action()"
            (valueChange)="store.setAction($event || 'all')"
          />
        </ui-field>
        <ui-field class="w-44 max-w-full" [label]="'audit.filters.entity' | transloco" #entityField>
          <ui-select
            [controlId]="entityField.controlId"
            [options]="entityOptions()"
            [value]="store.entityType()"
            (valueChange)="store.setEntityType($event || 'all')"
          />
        </ui-field>
        <ui-field class="w-[22rem] max-w-full" [label]="'audit.filters.dates' | transloco" #datesField>
          <ui-date-range
            [controlId]="datesField.controlId"
            [from]="store.fromDate()"
            [to]="store.toDate()"
            [ariaLabel]="'audit.filters.dates' | transloco"
            [placeholder]="'audit.filters.datesPlaceholder' | transloco"
            [toSeparator]="'audit.filters.toSeparator' | transloco"
            [clearLabel]="'audit.filters.clearDates' | transloco"
            [dialogLabel]="'audit.filters.datesDialog' | transloco"
            [locale]="transloco.activeLang()"
            [prevMonthLabel]="'audit.filters.prevMonth' | transloco"
            [nextMonthLabel]="'audit.filters.nextMonth' | transloco"
            [prevYearLabel]="'audit.filters.prevYear' | transloco"
            [nextYearLabel]="'audit.filters.nextYear' | transloco"
            [presets]="datePresets()"
            (rangeChange)="onDateRange($event)"
          />
        </ui-field>
        <div class="mb-4">
          <button
            uiBtn
            variant="outline"
            type="button"
            [disabled]="!store.hasActiveFilters()"
            (click)="store.clearFilters()"
          >
            {{ 'audit.actions.clearFilters' | transloco }}
          </button>
        </div>
      </div>

      @if (store.dateRangeInvalid()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'audit.errors.dateRangeInvalid' | transloco }}
        </p>
      }
      @if (store.error()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'audit.errors.loadFailed' | transloco }}
        </p>
      }
      @if (store.actorsError()) {
        <p role="alert" class="text-sm font-semibold text-danger">
          {{ 'audit.errors.actorsLoadFailed' | transloco }}
        </p>
      }

      @if (store.loading()) {
        <div role="status" aria-live="polite" class="flex flex-col gap-2.5">
          <span class="sr-only">{{ 'audit.loading' | transloco }}</span>
          <ui-skeleton [rows]="5" />
        </div>
      } @else if (store.empty()) {
        <ui-empty-state
          [headline]="
            (store.hasActiveFilters()
              ? 'audit.empty.filteredHeadline'
              : 'audit.empty.headline'
            ) | transloco
          "
          [message]="
            (store.hasActiveFilters()
              ? 'audit.empty.filteredMessage'
              : 'audit.empty.message'
            ) | transloco
          "
        >
          @if (store.hasActiveFilters()) {
            <button uiBtn variant="outline" type="button" (click)="store.clearFilters()">
              {{ 'audit.actions.clearFilters' | transloco }}
            </button>
          }
        </ui-empty-state>
      } @else if (store.total() > 0) {
        <div class="overflow-x-auto">
          <ui-table
            [caption]="'audit.tableCaption' | transloco"
            [columns]="columns()"
            [rows]="store.rows()"
            [rowKey]="rowKey"
            minWidth="56rem"
          >
            <ng-template uiCell="when" let-row>
              {{ row.created_at | date: 'MMM d, y, HH:mm' }}
            </ng-template>
            <ng-template uiCell="actor" let-row>
              <span class="flex flex-col">
                <span class="font-semibold text-ink">{{ actorName(row) }}</span>
                @if (row.actor_profile?.email; as email) {
                  <span class="text-[12px] text-ink-muted">{{ email }}</span>
                }
              </span>
            </ng-template>
            <ng-template uiCell="action" let-row>
              {{ actionLabel(row.action) }}
            </ng-template>
            <ng-template uiCell="entity" let-row>
              <span class="flex flex-col">
                <span class="font-semibold text-ink">{{ entityTypeLabel(row.entity_type) }}</span>
                @if (row.entity_id) {
                  <span class="font-mono text-[12px] text-ink-muted">{{ row.entity_id }}</span>
                }
              </span>
            </ng-template>
            <ng-template uiCell="detail" let-row>
              <button uiBtn variant="pill-muted" type="button" (click)="openDetail(row)">
                {{ 'audit.actions.viewDetail' | transloco }}
              </button>
            </ng-template>
          </ui-table>
        </div>

        <ui-pagination
          [page]="store.page()"
          [pageSize]="store.pageSize"
          [total]="store.total()"
          [prevLabel]="'audit.pagination.prev' | transloco"
          [nextLabel]="'audit.pagination.next' | transloco"
          [navLabel]="'audit.pagination.nav' | transloco"
          [summary]="paginationSummary"
          (pageChange)="store.setPage($event)"
        />
      }

      <ui-dialog
        [(open)]="detailOpen"
        [heading]="'audit.detail.heading' | transloco"
        [subtitle]="detailSubtitle()"
        [closeLabel]="'audit.detail.close' | transloco"
      >
        <pre
          class="max-h-[min(60vh,28rem)] overflow-auto rounded-lg border border-divider bg-canvas p-4 font-mono text-[12.5px] leading-relaxed text-ink whitespace-pre-wrap break-all"
          >@for (token of detailTokens(); track $index) {<span [class]="jsonTokenClass(token.kind)">{{ token.text }}</span>}</pre
        >
      </ui-dialog>
    </div>
  `,
})
export class AuditViewer implements OnInit {
  protected readonly store = inject(AuditStore);
  protected readonly transloco = inject(TranslocoService);

  protected readonly detailOpen = signal(false);
  private readonly selected = signal<AuditListItem | null>(null);

  protected readonly detailTokens = computed(() => highlightJson(this.selected()?.detail));
  protected readonly detailSubtitle = computed(() => {
    const row = this.selected();
    if (!row) {
      return '';
    }
    return this.actionLabel(row.action);
  });

  protected readonly datePresets = computed((): DateRangePreset[] => [
    { id: 'lastWeek', label: this.transloco.translate('audit.filters.lastWeek') },
    { id: 'lastMonth', label: this.transloco.translate('audit.filters.lastMonth') },
    { id: 'last3Months', label: this.transloco.translate('audit.filters.last3Months') },
  ]);

  protected readonly actorOptions = computed((): SelectOption[] => [
    { value: 'all', label: this.transloco.translate('audit.filters.allActors') },
    ...this.store.actors().map((actor) => ({
      value: actor.id,
      label: actor.full_name,
    })),
  ]);

  protected readonly actionOptions = computed((): SelectOption[] => [
    { value: 'all', label: this.transloco.translate('audit.filters.allActions') },
    ...AUDIT_ACTION_CODES.map((code) => ({
      value: code,
      label: this.actionLabel(code),
    })),
  ]);

  protected readonly entityOptions = computed((): SelectOption[] => [
    { value: 'all', label: this.transloco.translate('audit.filters.allEntities') },
    ...AUDIT_ENTITY_TYPES.map((type) => ({
      value: type,
      label: this.entityTypeLabel(type),
    })),
  ]);

  protected readonly columns = computed((): TableColumn<AuditListItem>[] => [
    { key: 'when', header: this.transloco.translate('audit.columns.when') },
    { key: 'actor', header: this.transloco.translate('audit.columns.actor') },
    { key: 'action', header: this.transloco.translate('audit.columns.action') },
    { key: 'entity', header: this.transloco.translate('audit.columns.entity') },
    {
      key: 'detail',
      header: this.transloco.translate('audit.columns.detail'),
      align: 'right',
    },
  ]);

  ngOnInit(): void {
    void this.store.init();
  }

  protected readonly rowKey = (row: AuditListItem): string => row.id;

  protected readonly paginationSummary = (range: {
    from: number;
    to: number;
    total: number;
  }): string => this.transloco.translate('audit.pagination.summary', range);

  protected actionLabel(action: string): string {
    const key = auditActionLabelKey(action);
    const translated = this.transloco.translate(key);
    return translated === key ? action : translated;
  }

  protected entityTypeLabel(entityType: string): string {
    const key = `audit.entityTypes.${entityType}`;
    const translated = this.transloco.translate(key);
    return translated === key ? entityType : translated;
  }

  protected actorName(row: AuditListItem): string {
    return (
      row.actor_profile?.full_name ??
      this.transloco.translate('audit.unknownActor')
    );
  }

  protected onDateRange(range: DateRangeValue): void {
    void this.store.setDateRange(range.from, range.to);
  }

  protected openDetail(row: AuditListItem): void {
    this.selected.set(row);
    this.detailOpen.set(true);
  }

  protected jsonTokenClass(kind: JsonHighlightKind): string {
    switch (kind) {
      case 'key':
        return 'text-brand-dark font-semibold';
      case 'string':
        return 'text-success';
      case 'number':
        return 'text-warning';
      case 'boolean':
        return 'text-badge-purple-text';
      case 'null':
        return 'text-ink-muted italic';
      case 'punctuation':
        return 'text-ink-muted';
      case 'plain':
        return 'text-ink';
      default: {
        const _exhaustive: never = kind;
        return _exhaustive;
      }
    }
  }
}
