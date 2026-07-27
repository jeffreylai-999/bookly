import { Component, computed, input } from '@angular/core';

export type DeltaTone = 'good' | 'bad' | 'neutral';
export type DeltaDirection = 'up' | 'down';

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
      <div
        data-testid="kpi-delta"
        class="mt-1.5 text-[12.5px] font-semibold"
        [class]="deltaClass()"
      >
        <span aria-hidden="true">{{ direction() === 'down' ? '▼' : '▲' }}</span>
        <!--
          The glyph is decorative and the tone is colour, so without this the
          delta reaches a screen reader as a bare "12% vs yesterday" with no
          indication of which way it moved (WCAG 1.4.1).
        -->
        <span class="sr-only">{{ directionLabel() }}</span>
        {{ delta() }}
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
  /**
   * Which way the metric moved, separate from whether that is good news:
   * overdue loans rising is `up` and `bad`, fines collected rising is `up` and
   * `good`. Tone drives colour, direction drives the glyph and its label.
   */
  readonly direction = input<DeltaDirection>('up');
  // i18n-agnostic per ADR-0004: consumers pass translated strings.
  readonly upLabel = input('Up');
  readonly downLabel = input('Down');
  readonly hero = input(false);
  protected readonly deltaClass = computed(() => DELTA_TONE_CLASSES[this.deltaTone()]);
  protected readonly directionLabel = computed(() =>
    this.direction() === 'down' ? this.downLabel() : this.upLabel(),
  );
}
