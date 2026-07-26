import { Component, input, model } from '@angular/core';

export interface SelectOption {
  label: string;
  value: string;
}

/**
 * Wraps a native `<select>` rather than reimplementing a listbox: the platform
 * control already carries keyboard support, type-ahead, and the mobile picker,
 * and a filter bar has nothing a custom one would buy. Styled to DESIGN.md §3.7.
 */
@Component({
  selector: 'ui-select',
  template: `
    <select
      class="w-full cursor-pointer appearance-none rounded-lg border border-line bg-surface bg-[length:16px] bg-[right_12px_center] bg-no-repeat py-2.5 pl-3.5 pr-9 text-sm text-ink transition-colors duration-100 focus-ring focus:border-brand disabled:cursor-default disabled:text-disabled"
      [style.background-image]="chevron"
      [id]="controlId() ?? null"
      [attr.aria-label]="ariaLabel() ?? null"
      [attr.aria-describedby]="describedBy() ?? null"
      [disabled]="disabled()"
      [value]="value()"
      (change)="onChange($event)"
    >
      @if (placeholder(); as ph) {
        <option value="" disabled>{{ ph }}</option>
      }
      @for (opt of options(); track opt.value) {
        <option [value]="opt.value">{{ opt.label }}</option>
      }
    </select>
  `,
  host: { class: 'block' },
})
export class UiSelect {
  readonly options = input.required<SelectOption[]>();
  readonly value = model('');
  readonly placeholder = input<string>();
  readonly ariaLabel = input<string>();
  readonly controlId = input<string>();
  readonly describedBy = input<string | null>(null);
  readonly disabled = input(false);

  /** Inline so the arrow inherits the ink-muted token without a sprite request. */
  protected readonly chevron = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%23616c7d' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E")`;

  protected onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
