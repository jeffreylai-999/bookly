import { Component, OnDestroy, ElementRef, input, model, output, viewChild } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

@Component({
  selector: 'ui-search-input',
  imports: [LucideAngularModule],
  template: `
    <lucide-angular
      [name]="scan() ? 'scan-barcode' : 'search'"
      [size]="16"
      [strokeWidth]="1.75"
      class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
    />
    <input
      #input
      type="search"
      class="w-full rounded-lg border border-line bg-surface py-2.5 pl-9 pr-3.5 text-sm text-ink transition-colors duration-100 placeholder:text-ink-muted focus-ring focus:border-brand"
      [placeholder]="placeholder()"
      [value]="value()"
      [attr.aria-label]="ariaLabel() ?? placeholder()"
      [attr.autocomplete]="scan() ? 'off' : null"
      [attr.spellcheck]="scan() ? 'false' : null"
      [attr.enterkeyhint]="scan() ? 'go' : 'search'"
      (input)="onInput($event)"
      (keydown.enter)="onEnter()"
    />
  `,
  host: { class: 'relative block' },
})
export class UiSearchInput implements OnDestroy {
  readonly value = model('');
  readonly placeholder = input('Search');
  readonly ariaLabel = input<string>();
  /**
   * Circulation-desk mode for barcode guns.
   *
   * A scanner types an ISBN or patron barcode in a few milliseconds and sends
   * Enter. Under plain debounce that scan waits 300ms and, worse, a second scan
   * arriving inside the window cancels the first outright. In scan mode Enter
   * fires `submitted` immediately, cancels any pending debounce, and clears the
   * field so the next item can be scanned without touching the keyboard.
   */
  readonly scan = input(false);
  readonly debounceMs = input(300);
  readonly debouncedChange = output<string>();
  readonly submitted = output<string>();

  private readonly inputRef = viewChild.required<ElementRef<HTMLInputElement>>('input');
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected onInput(event: Event): void {
    const v = (event.target as HTMLInputElement).value;
    this.value.set(v);
    this.cancelPending();
    // Scan mode has no use for keystroke-by-keystroke filtering; Enter is the event.
    if (this.scan()) return;
    this.timer = setTimeout(() => this.debouncedChange.emit(v), this.debounceMs());
  }

  protected onEnter(): void {
    this.cancelPending();
    const v = this.value();
    if (!v) return;
    this.submitted.emit(v);
    if (!this.scan()) return;
    this.value.set('');
    this.inputRef().nativeElement.value = '';
  }

  private cancelPending(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  ngOnDestroy(): void {
    this.cancelPending();
  }
}
