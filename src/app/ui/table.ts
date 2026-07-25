import { NgTemplateOutlet } from '@angular/common';
import {
  Component,
  Directive,
  TemplateRef,
  contentChildren,
  inject,
  input,
} from '@angular/core';

export interface TableColumn<T = unknown> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'right';
  value?: (row: T) => string | number;
}

@Directive({ selector: 'ng-template[uiCell]' })
export class UiCellDef {
  readonly uiCell = input.required<string>();
  readonly template = inject(TemplateRef);
}

@Component({
  selector: 'ui-table',
  imports: [NgTemplateOutlet],
  template: `
    <table class="w-full table-fixed border-collapse">
      <thead>
        <tr class="border-b border-line">
          @for (col of columns(); track col.key) {
            <th
              scope="col"
              class="px-3 py-3.5 text-xs font-bold uppercase tracking-[0.06em] text-ink-muted first:pl-6 last:pr-6"
              [class]="col.align === 'right' ? 'text-right' : 'text-left'"
              [style.width]="col.width ?? null"
            >
              {{ col.header }}
            </th>
          }
        </tr>
      </thead>
      <tbody>
        @for (row of rows(); track trackRow(row)) {
          <tr class="border-b border-divider last:border-b-0 hover:bg-row-hover">
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
            <td [attr.colspan]="columns().length">
              <ng-content select="ui-empty-state" />
            </td>
          </tr>
        }
      </tbody>
    </table>
  `,
  host: { class: 'block overflow-hidden rounded-card border border-line bg-surface' },
})
export class UiTable<T> {
  readonly columns = input.required<TableColumn<T>[]>();
  readonly rows = input.required<T[]>();
  readonly rowKey = input<(row: T) => unknown>();
  private readonly cellDefs = contentChildren(UiCellDef);

  protected trackRow(row: T): unknown {
    const key = this.rowKey();
    return key ? key(row) : row;
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
