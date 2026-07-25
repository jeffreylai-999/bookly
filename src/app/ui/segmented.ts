import { Component, ElementRef, computed, input, model, viewChildren } from '@angular/core';

export interface SegmentedOption {
  label: string;
  value: string;
}

@Component({
  selector: 'ui-segmented',
  template: `
    <div
      role="radiogroup"
      [attr.aria-label]="groupLabel()"
      class="flex w-fit gap-1 rounded-[10px] bg-control p-1"
      (keydown)="onKeydown($event)"
    >
      @for (opt of options(); track opt.value) {
        <button
          #tabBtn
          type="button"
          role="radio"
          class="cursor-pointer rounded-lg border-0 px-4 py-2 text-[13.5px] font-bold focus-ring"
          [class]="
            opt.value === selected()
              ? 'bg-surface text-ink-heading shadow-tab'
              : 'bg-transparent text-ink-muted'
          "
          [attr.aria-checked]="opt.value === selected()"
          [tabindex]="opt.value === selected() ? 0 : -1"
          (click)="value.set(opt.value)"
        >
          {{ opt.label }}
        </button>
      }
    </div>
  `,
})
export class UiSegmented {
  readonly options = input.required<SegmentedOption[]>();
  readonly groupLabel = input<string>();
  readonly value = model<string>();
  protected readonly selected = computed(() => this.value() ?? this.options()[0]?.value);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabBtn');

  protected onKeydown(event: KeyboardEvent): void {
    const opts = this.options();
    if (opts.length === 0) return;
    const current = Math.max(
      0,
      opts.findIndex((o) => o.value === this.selected()),
    );
    let next = -1;
    if (event.key === 'ArrowRight') next = (current + 1) % opts.length;
    if (event.key === 'ArrowLeft') next = (current - 1 + opts.length) % opts.length;
    if (next < 0) return;
    event.preventDefault();
    this.value.set(opts[next].value);
    this.buttons()[next]?.nativeElement.focus();
  }
}
