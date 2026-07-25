import { Component, computed, input } from '@angular/core';

export type ProgressColor = 'brand' | 'cyan' | 'amber' | 'purple' | 'success' | 'danger';

const PROGRESS_COLOR_CLASSES: Record<ProgressColor, string> = {
  brand: 'bg-brand',
  cyan: 'bg-chart-cyan',
  amber: 'bg-chart-amber',
  purple: 'bg-chart-purple',
  success: 'bg-success',
  danger: 'bg-danger',
};

@Component({
  selector: 'ui-progress',
  template: `
    @if (label()) {
      <div class="mb-1.5 flex items-center justify-between text-[13px]">
        <span class="font-semibold text-ink">{{ label() }}</span>
        <span class="text-ink-muted">{{ valueLabel() ?? value() }}</span>
      </div>
    }
    <div
      class="h-2 overflow-hidden rounded-full bg-control"
      role="progressbar"
      [attr.aria-valuenow]="value()"
      [attr.aria-valuemin]="0"
      [attr.aria-valuemax]="max()"
      [attr.aria-label]="label() ?? 'Progress'"
    >
      <div class="h-full rounded-full" [class]="fillClass()" [style.width.%]="pct()"></div>
    </div>
  `,
  host: { class: 'block' },
})
export class UiProgress {
  readonly value = input.required<number>();
  readonly max = input(100);
  readonly color = input<ProgressColor>('brand');
  readonly label = input<string>();
  readonly valueLabel = input<string>();
  protected readonly pct = computed(() =>
    Math.max(0, Math.min(100, (this.value() / Math.max(1, this.max())) * 100)),
  );
  protected readonly fillClass = computed(() => PROGRESS_COLOR_CLASSES[this.color()]);
}
