import { Component, computed, input } from '@angular/core';

export interface BarPoint {
  label: string;
  value: number;
  secondary?: number;
}

@Component({
  selector: 'ui-bar-chart',
  template: `
    @if (hasSecondary()) {
      <!--
        Teal and cyan sit at 1.42:1 against each other, so the two series are not
        separable by hue alone (WCAG 1.4.1). The legend names them and the
        secondary bar carries a stripe, which also survives greyscale printing.
      -->
      <div class="mb-3 flex items-center gap-4 text-[11px] text-ink-muted">
        <span class="inline-flex items-center gap-1.5">
          <span class="size-2.5 rounded-sm bg-chart-teal"></span>{{ seriesLabel() }}
        </span>
        <span class="inline-flex items-center gap-1.5">
          <span class="size-2.5 rounded-sm bg-chart-cyan" [style.background-image]="stripe"></span>
          {{ secondaryLabel() }}
        </span>
      </div>
    }
    <div class="flex h-[140px] items-end gap-2" aria-hidden="true">
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
                [style.background-image]="stripe"
                [style.height.%]="pct(p.secondary)"
                [title]="p.label + ': ' + p.secondary"
              ></div>
            }
          </div>
          <div class="max-w-full truncate text-[11px] text-ink-muted">{{ p.label }}</div>
        </div>
      }
    </div>
    <!--
      The bars encode their numbers only as pixel heights, so a single aria-label
      on an image role leaves a screen reader with the chart's name and none of
      its data. This is the same series in a readable form.
    -->
    <table class="sr-only">
      <caption>
        {{
          chartLabel()
        }}
      </caption>
      <thead>
        <tr>
          <th scope="col">{{ categoryLabel() }}</th>
          <th scope="col">{{ seriesLabel() }}</th>
          @if (hasSecondary()) {
            <th scope="col">{{ secondaryLabel() }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (p of series(); track $index) {
          <tr>
            <th scope="row">{{ p.label }}</th>
            <td>{{ p.value }}</td>
            @if (hasSecondary()) {
              <td>{{ p.secondary ?? '—' }}</td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  host: { class: 'block' },
})
export class UiBarChart {
  readonly series = input.required<BarPoint[]>();
  readonly chartLabel = input.required<string>();
  // i18n-agnostic per ADR-0004: consumers pass translated strings.
  readonly categoryLabel = input('Category');
  readonly seriesLabel = input('Value');
  readonly secondaryLabel = input('Comparison');

  protected readonly hasSecondary = computed(() =>
    this.series().some((p) => p.secondary !== undefined),
  );
  private readonly maxValue = computed(() =>
    Math.max(1, ...this.series().flatMap((p) => [p.value, p.secondary ?? 0])),
  );

  protected readonly stripe =
    'repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 3px, transparent 3px 7px)';

  protected pct(value: number): number {
    return (value / this.maxValue()) * 100;
  }
}
