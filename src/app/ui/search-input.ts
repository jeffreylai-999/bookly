import { Component, OnDestroy, input, model, output } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'ui-search-input',
  imports: [LucideAngularModule],
  template: `
    <lucide-angular
      name="search"
      [size]="16"
      [strokeWidth]="1.75"
      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
    />
    <input
      type="search"
      class="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3.5 text-sm text-ink placeholder:text-ink-muted focus-ring focus:border-brand"
      [placeholder]="placeholder()"
      [value]="value()"
      [attr.aria-label]="ariaLabel() ?? placeholder()"
      (input)="onInput($event)"
    />
  `,
  host: { class: 'relative block' },
})
export class UiSearchInput implements OnDestroy {
  readonly value = model('');
  readonly placeholder = input('Search');
  readonly ariaLabel = input<string>();
  readonly debouncedChange = output<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected onInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.value.set(v);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.debouncedChange.emit(v), 300);
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
