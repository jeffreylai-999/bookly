import { Component, ElementRef, effect, input, model, viewChild } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';

let nextDialogId = 0;

/**
 * Modal built on the native `<dialog>` element.
 *
 * `showModal()` brings focus trapping, the inert backdrop, Escape-to-close, and
 * top-layer stacking from the platform, none of which are worth hand-rolling.
 * DESIGN.md §4 prefers toasts over modals for action feedback — this is for the
 * cases a toast cannot cover, namely forms ("Add title", "Edit patron") and
 * destructive confirmations.
 */
@Component({
  selector: 'ui-dialog',
  imports: [LucideAngularModule],
  template: `
    <dialog
      #dialog
      class="fixed left-1/2 top-1/2 max-h-[90vh] w-[min(92vw,32rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-card border border-line bg-surface p-0 text-ink backdrop:bg-ink-heading/40 open:flex"
      [attr.aria-labelledby]="titleId"
      (close)="open.set(false)"
      (cancel)="open.set(false)"
    >
      <div class="flex shrink-0 items-start justify-between gap-4 px-6 pb-4 pt-6">
        <div class="min-w-0">
          <h2 [id]="titleId" class="text-[15px] font-bold text-ink-heading">{{ heading() }}</h2>
          @if (subtitle()) {
            <p class="mt-0.5 text-[12.5px] text-ink-muted">{{ subtitle() }}</p>
          }
        </div>
        <button
          type="button"
          class="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border-0 bg-transparent text-ink-soft transition-colors duration-100 hover:bg-control-hover focus-ring"
          [attr.aria-label]="closeLabel()"
          (click)="open.set(false)"
        >
          <lucide-angular name="x" [size]="18" [strokeWidth]="1.75" />
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-6 pb-6">
        <ng-content />
      </div>
      <div class="flex shrink-0 justify-end gap-3 border-t border-divider px-6 py-4 empty:hidden">
        <ng-content select="[dialog-actions]" />
      </div>
    </dialog>
  `,
})
export class UiDialog {
  readonly open = model(false);
  readonly heading = input.required<string>();
  readonly subtitle = input<string>();
  // i18n-agnostic per ADR-0004: consumers pass translated strings.
  readonly closeLabel = input('Close dialog');

  protected readonly titleId = `ui-dialog-${nextDialogId++}-title`;
  private readonly dialogRef = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const el = this.dialogRef().nativeElement;
      const wantOpen = this.open();
      // showModal is missing on the server-side DOM and in jsdom. Falling back
      // to the `open` property keeps the markup truthful there; every real
      // browser takes the showModal path and gets the modal behaviour.
      const canGoModal = typeof el.showModal === 'function';
      if (wantOpen === el.open) return;
      if (wantOpen) {
        if (canGoModal) el.showModal();
        else el.open = true;
      } else if (canGoModal) {
        el.close();
      } else {
        el.open = false;
      }
    });
  }
}
