import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  Directive,
  TemplateRef,
  computed,
  contentChildren,
  inject,
  input,
  model,
} from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

export interface TableColumn<T = unknown> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'right';
  value?: (row: T) => string | number;
  /** Renders a sort control in the header and lets `sort` land on this key. */
  sortable?: boolean;
  /** Comparison value for sorting; falls back to `value`, then the raw field. */
  sortValue?: (row: T) => string | number;
}

export type SortDirection = 'asc' | 'desc';

export interface TableSort {
  key: string;
  direction: SortDirection;
}

/**
 * The table renders sort affordances but does not reorder `rows` — a server-paged
 * table sorts in the query, not in the view, and a table that quietly re-sorts the
 * page it was handed would fight that. Client-side consumers pipe their rows
 * through this helper instead, the same way pagination exposes `pageRange`.
 */
export function sortRows<T>(rows: T[], sort: TableSort | null, columns: TableColumn<T>[]): T[] {
  if (!sort) return rows;
  // `sortable` gates this too, not just the header control. The header renders no
  // control and reports no `aria-sort` for a non-sortable column, so honouring a
  // key like that would show sorted data under headers that all claim to be
  // unsorted — reachable whenever `sort` is restored from a query param.
  const col = columns.find((c) => c.key === sort.key && c.sortable);
  if (!col) return rows;
  const read = (row: T): string | number => {
    if (col.sortValue) return col.sortValue(row);
    if (col.value) return col.value(row);
    const v = (row as Record<string, unknown>)[col.key];
    return typeof v === 'number' ? v : v == null ? '' : String(v);
  };
  const factor = sort.direction === 'asc' ? 1 : -1;
  // Copy first: Array.prototype.sort mutates, and `rows` belongs to the caller.
  return [...rows].sort((a, b) => {
    const [x, y] = [read(a), read(b)];
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
    return String(x).localeCompare(String(y), undefined, { numeric: true }) * factor;
  });
}

@Directive({ selector: 'ng-template[uiCell]' })
export class UiCellDef {
  readonly uiCell = input.required<string>();
  readonly template = inject(TemplateRef);
}

@Component({
  selector: 'ui-table',
  imports: [NgTemplateOutlet, LucideAngularModule],
  template: `
    <!--
      The scroll container is focusable and labelled: a region that scrolls but
      cannot be reached by keyboard strands its overflow (WCAG 2.1.1). A library
      catalog table runs 8+ columns, so it will overflow on anything but a wide
      screen.
    -->
    <div
      class="overflow-x-auto focus-ring"
      tabindex="0"
      role="region"
      [attr.aria-label]="caption()"
    >
      <table class="w-full table-fixed border-collapse" [style.min-width]="minWidth() ?? null">
        <caption class="sr-only">
          {{
            caption()
          }}
        </caption>
        <thead>
          <tr class="border-b border-line">
            @if (selectable()) {
              <th scope="col" class="w-12 py-3.5 pl-6 pr-3 text-left">
                <input
                  type="checkbox"
                  class="size-4 cursor-pointer accent-brand-dark focus-ring"
                  [checked]="allSelected()"
                  [indeterminate]="someSelected()"
                  [attr.aria-label]="selectAllLabel()"
                  (change)="toggleAll()"
                />
              </th>
            }
            @for (col of columns(); track col.key) {
              <th
                scope="col"
                class="px-3 py-3.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted first:pl-6 last:pr-6"
                [class]="col.align === 'right' ? 'text-right' : 'text-left'"
                [style.width]="col.width ?? null"
                [attr.aria-sort]="ariaSort(col)"
              >
                @if (col.sortable) {
                  <button
                    type="button"
                    class="inline-flex cursor-pointer items-center gap-1 rounded uppercase tracking-[0.06em] transition-colors duration-100 hover:text-ink-heading focus-ring"
                    (click)="toggleSort(col.key)"
                  >
                    {{ col.header }}
                    <lucide-angular
                      [name]="sortIcon(col.key)"
                      [size]="14"
                      [strokeWidth]="2"
                      aria-hidden="true"
                    />
                  </button>
                } @else {
                  {{ col.header }}
                }
              </th>
            }
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track trackRow(row)) {
            <tr
              class="border-b border-divider transition-colors duration-100 last:border-b-0 hover:bg-row-hover"
              [class.bg-badge-cyan-bg]="selectable() && isSelected(row)"
            >
              @if (selectable()) {
                <td class="w-12 py-4 pl-6 pr-3">
                  <input
                    type="checkbox"
                    class="size-4 cursor-pointer accent-brand-dark focus-ring"
                    [checked]="isSelected(row)"
                    [attr.aria-label]="rowSelectLabel()(row)"
                    (change)="toggleRow(row)"
                  />
                </td>
              }
              @for (col of columns(); track col.key) {
                <td
                  class="px-3 py-4 text-[13.5px] text-ink first:pl-6 last:pr-6"
                  [class]="col.align === 'right' ? 'text-right' : 'text-left'"
                >
                  @if (cellTemplate(col.key); as tpl) {
                    <ng-container *ngTemplateOutlet="tpl; context: { $implicit: row }" />
                  } @else {
                    {{ cellText(col, row) }}
                  }
                </td>
              }
            </tr>
          } @empty {
            <tr>
              <td [attr.colspan]="totalColumns()">
                <ng-content select="ui-empty-state" />
              </td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  host: { class: 'block overflow-hidden rounded-card border border-line bg-surface' },
})
export class UiTable<T> {
  readonly columns = input.required<TableColumn<T>[]>();
  readonly rows = input.required<T[]>();
  readonly rowKey = input<(row: T) => unknown>();
  /** Names the table for screen readers and labels the scrollable region. */
  readonly caption = input.required<string>();
  /** Keeps columns legible instead of crushing them once the region scrolls. */
  readonly minWidth = input<string>();

  readonly sort = model<TableSort | null>(null);

  readonly selectable = input(false);
  readonly selected = model<readonly unknown[]>([]);
  // i18n-agnostic per ADR-0004: consumers pass translated strings.
  readonly selectAllLabel = input('Select all rows');
  readonly rowSelectLabel = input<(row: T) => string>(() => 'Select row');

  private readonly cellDefs = contentChildren(UiCellDef);
  private readonly selectedKeys = computed(() => new Set(this.selected()));

  protected readonly totalColumns = computed(
    () => this.columns().length + (this.selectable() ? 1 : 0),
  );
  protected readonly allSelected = computed(
    () => this.rows().length > 0 && this.rows().every((r) => this.isSelected(r)),
  );
  protected readonly someSelected = computed(
    () => !this.allSelected() && this.rows().some((r) => this.isSelected(r)),
  );

  protected trackRow(row: T): unknown {
    const key = this.rowKey();
    return key ? key(row) : row;
  }

  protected isSelected(row: T): boolean {
    return this.selectedKeys().has(this.trackRow(row));
  }

  protected toggleRow(row: T): void {
    const key = this.trackRow(row);
    const next = new Set(this.selected());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.selected.set([...next]);
  }

  /**
   * Select-all is scoped to the rows currently rendered, so it never silently
   * selects rows on other pages that the person cannot see.
   */
  protected toggleAll(): void {
    const pageKeys = this.rows().map((r) => this.trackRow(r));
    const next = new Set(this.selected());
    if (this.allSelected()) pageKeys.forEach((k) => next.delete(k));
    else pageKeys.forEach((k) => next.add(k));
    this.selected.set([...next]);
  }

  protected toggleSort(key: string): void {
    const current = this.sort();
    if (current?.key !== key) this.sort.set({ key, direction: 'asc' });
    else if (current.direction === 'asc') this.sort.set({ key, direction: 'desc' });
    else this.sort.set(null);
  }

  protected ariaSort(col: TableColumn<T>): 'ascending' | 'descending' | 'none' | null {
    if (!col.sortable) return null;
    const current = this.sort();
    if (current?.key !== col.key) return 'none';
    return current.direction === 'asc' ? 'ascending' : 'descending';
  }

  protected sortIcon(key: string): string {
    const current = this.sort();
    if (current?.key !== key) return 'chevrons-up-down';
    return current.direction === 'asc' ? 'chevron-up' : 'chevron-down';
  }

  protected cellTemplate(key: string): TemplateRef<unknown> | null {
    return this.cellDefs().find((d) => d.uiCell() === key)?.template ?? null;
  }

  protected cellText(col: TableColumn<T>, row: T): string | number {
    if (col.value) return col.value(row);
    const v = (row as Record<string, unknown>)[col.key];
    return v == null ? '' : String(v);
  }
}
