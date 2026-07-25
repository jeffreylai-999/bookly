import { Component, computed, input } from '@angular/core';

export interface BarPoint {
  label: string;
  value: number;
  secondary?: number;
}

@Component({
  selector: 'ui-bar-chart',
  template: `
    <div class="flex h-[140px] items-end gap-2" role="img" [attr.aria-label]="chartLabel()">
      @for (p of series(); track $index) {
        <div class="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <div class="flex w-full flex-1 items-end justify-center gap-1">
            <div
              data-testid="bar-primary"
              class="w-full max-w-7 rounded-t bg-chart-teal"
              [style.height.%]="pct(p.value)"
              [title]="p.label + ': ' + p.value"
            ></div>
            @if (p.secondary !== undefined) {
              <div
                data-testid="bar-secondary"
                class="w-full max-w-7 rounded-t bg-chart-cyan"
                [style.height.%]="pct(p.secondary)"
                [title]="p.label + ': ' + p.secondary"
              ></div>
            }
          </div>
          <div class="max-w-full truncate text-[11px] text-ink-muted">{{ p.label }}</div>
        </div>
      }
    </div>
  `,
  host: { class: 'block' },
})
export class UiBarChart {
  readonly series = input.required<BarPoint[]>();
  readonly chartLabel = input.required<string>();
  private readonly maxValue = computed(() =>
    Math.max(1, ...this.series().flatMap((p) => [p.value, p.secondary ?? 0])),
  );

  protected pct(value: number): number {
    return (value / this.maxValue()) * 100;
  }
}
