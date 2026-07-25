import { Component, input } from '@angular/core';

@Component({
  selector: 'ui-card',
  template: `
    <div class="mb-4 flex items-start justify-between gap-4 empty:hidden">
      @if (title()) {
        <div>
          <h3 class="text-[15px] font-bold text-ink-heading">{{ title() }}</h3>
          @if (subtitle()) {
            <span class="mt-0.5 block text-[12.5px] text-ink-muted">{{ subtitle() }}</span>
          }
        </div>
      }
      <ng-content select="[card-actions]" />
    </div>
    <ng-content />
  `,
  host: { class: 'block rounded-card border border-line bg-surface p-6' },
})
export class UiCard {
  readonly title = input<string>();
  readonly subtitle = input<string>();
}
