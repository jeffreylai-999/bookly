import { Component, computed, input } from '@angular/core';

export type DeltaTone = 'good' | 'bad' | 'neutral';

const DELTA_TONE_CLASSES: Record<DeltaTone, string> = {
  good: 'text-success',
  bad: 'text-danger',
  neutral: 'text-brand-dark',
};

@Component({
  selector: 'ui-kpi-card',
  template: `
    <div class="text-xs font-bold uppercase tracking-[0.08em] text-ink-muted">{{ label() }}</div>
    <div
      data-testid="kpi-value"
      class="mt-2 text-4xl font-extrabold tracking-[-0.02em]"
      [class]="hero() ? 'text-brand' : 'text-ink-heading'"
    >
      {{ value() }}
    </div>
    @if (delta()) {
      <div data-testid="kpi-delta" class="mt-1.5 text-[12.5px] font-semibold" [class]="deltaClass()">
        <span aria-hidden="true">▲</span> {{ delta() }}
      </div>
    }
  `,
  host: { class: 'block rounded-card border border-line bg-surface p-6' },
})
export class UiKpiCard {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly delta = input<string>();
  readonly deltaTone = input<DeltaTone>('neutral');
  readonly hero = input(false);
  protected readonly deltaClass = computed(() => DELTA_TONE_CLASSES[this.deltaTone()]);
}
