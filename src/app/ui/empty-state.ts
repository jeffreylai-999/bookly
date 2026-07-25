import { Component, input } from '@angular/core';

@Component({
  selector: 'ui-empty-state',
  template: `
    <div class="text-sm font-semibold text-ink-heading">{{ headline() }}</div>
    @if (message()) {
      <p class="mt-1 text-[13px] text-ink-muted">{{ message() }}</p>
    }
    <div class="mt-4 empty:hidden"><ng-content /></div>
  `,
  host: { class: 'block px-6 py-12 text-center' },
})
export class UiEmptyState {
  readonly headline = input.required<string>();
  readonly message = input<string>();
}
