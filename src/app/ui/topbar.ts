import { Component, input } from '@angular/core';

@Component({
  selector: 'ui-topbar',
  template: `
    <div class="min-w-0">
      <h1 class="truncate text-xl font-extrabold tracking-[-0.01em] text-ink-heading">
        {{ pageTitle() }}
      </h1>
      @if (subtitle()) {
        <p class="truncate text-[12.5px] text-ink-muted">{{ subtitle() }}</p>
      }
    </div>
    <div class="flex items-center gap-3"><ng-content /></div>
  `,
  host: {
    class: 'flex h-[76px] shrink-0 items-center justify-between border-b border-line bg-surface px-8',
  },
})
export class UiTopbar {
  readonly pageTitle = input.required<string>();
  readonly subtitle = input<string>();
}
