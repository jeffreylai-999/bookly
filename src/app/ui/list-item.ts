import { Component, computed, input } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { BADGE_TONE_CLASSES, BadgeTone } from './badge';

@Component({
  selector: 'ui-list-item',
  imports: [LucideAngularModule],
  template: `
    <span
      data-testid="list-chip"
      class="flex size-8 shrink-0 items-center justify-center rounded-lg"
      [class]="chipClass()"
    >
      <lucide-angular [name]="icon()" [size]="16" [strokeWidth]="1.75" />
    </span>
    <span class="min-w-0 flex-1">
      <span class="block truncate text-[13.5px] font-semibold text-ink">{{ title() }}</span>
      @if (meta()) {
        <span class="block text-xs text-ink-muted">{{ meta() }}</span>
      }
    </span>
    <ng-content />
  `,
  host: { class: 'flex items-center gap-3' },
})
export class UiListItem {
  readonly icon = input.required<string>();
  readonly iconTone = input<BadgeTone>('neutral');
  readonly title = input.required<string>();
  readonly meta = input<string>();
  protected readonly chipClass = computed(() => BADGE_TONE_CLASSES[this.iconTone()]);
}
