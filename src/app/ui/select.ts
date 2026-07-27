import { Component, computed, effect, input, model } from '@angular/core';

export interface SelectOption {
  label: string;
  value: string;
}

/**
 * Wraps a native `<select>` rather than reimplementing a listbox: the platform
 * control already carries keyboard support, type-ahead, and the mobile picker,
 * and a filter bar has nothing a custom one would buy. Styled to DESIGN.md §3.7.
 *
 * Selection is expressed per-option via `selected`, not by binding `value` on the
 * `<select>`. Two reasons, both spec behaviour rather than quirks:
 *
 * - Setting `select.value` before its `<option>` children exist is silently
 *   dropped, and Angular applies host bindings before rendering `@for` content.
 *   An initial value that matched an option was being lost on first render.
 * - The selectedness-setting algorithm skips disabled options, so a disabled
 *   placeholder is never auto-selected. It has to say `selected` to display.
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
      (change)="onChange($event)"
    >
      @if (placeholder(); as ph) {
        <option value="" disabled [selected]="!matched()">{{ ph }}</option>
      }
      @for (opt of options(); track opt.value) {
        <option [value]="opt.value" [selected]="opt.value === value()">{{ opt.label }}</option>
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

  protected readonly matched = computed(() => this.options().some((o) => o.value === this.value()));

  constructor() {
    /**
     * A native select always has something selected, so a model the options
     * cannot represent is a state the control can never show. With a placeholder
     * that state is legitimate — the placeholder stands for it. Without one, the
     * browser displays the first option while the model still reads its default,
     * and a consumer filters on `''` for a control the user sees as set. Adopting
     * the first option keeps the two in agreement.
     *
     * This writes to a signal it reads, which converges: after the write the
     * value matches an option and the condition is false.
     */
    effect(() => {
      const opts = this.options();
      if (this.placeholder() !== undefined || this.matched() || opts.length === 0) return;
      this.value.set(opts[0].value);
    });
  }

  protected onChange(event: Event): void {
    this.value.set((event.target as HTMLSelectElement).value);
  }
}
