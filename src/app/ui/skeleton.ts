import { Component, input } from '@angular/core';

/**
 * Loading placeholder.
 *
 * DESIGN.md §4 says no animation; the pulse here is the documented exception,
 * because a static grey block is indistinguishable from an empty state or a
 * broken layout. It is suppressed under `prefers-reduced-motion`.
 *
 * `aria-hidden` plus a live-region announcement on the container is deliberate:
 * screen readers should hear "Loading titles" once, not one entry per bar.
 */
@Component({
  selector: 'ui-skeleton',
  template: `
    @for (row of rowSpans(); track $index) {
      <span
        class="block animate-pulse rounded-lg bg-control motion-reduce:animate-none"
        [style.height.px]="height()"
        [style.width]="row"
      ></span>
    }
  `,
  host: {
    class: 'flex flex-col gap-2.5',
    'aria-hidden': 'true',
  },
})
export class UiSkeleton {
  readonly rows = input(1);
  readonly height = input(14);
  /** Ragged widths read as text; uniform bars read as a table or a chart. */
  readonly ragged = input(true);

  protected rowSpans(): string[] {
    const widths = ['100%', '92%', '78%', '96%', '85%'];
    return Array.from({ length: Math.max(1, this.rows()) }, (_, i) =>
      this.ragged() ? widths[i % widths.length] : '100%',
    );
  }
}
