import { Component, computed, input } from '@angular/core';

let nextFieldId = 0;

/**
 * Label + hint + error wrapper for a single form control.
 *
 * The control stays projected rather than owned so this works with a native
 * input, a `ui-select`, or anything else. Wiring is via a template reference —
 * the field mints the ids, the consumer binds them:
 *
 * ```html
 * <ui-field label="Title" hint="As printed on the spine" #f>
 *   <input [id]="f.controlId" [attr.aria-describedby]="f.describedBy()" />
 * </ui-field>
 * ```
 */
@Component({
  selector: 'ui-field',
  template: `
    <label [for]="controlId" class="mb-1.5 block text-[13px] font-semibold text-ink">
      {{ label() }}
      @if (required()) {
        <span class="text-danger" aria-hidden="true">*</span>
      }
    </label>
    <ng-content />
    @if (error()) {
      <p [id]="errorId" role="alert" class="mt-1.5 text-xs font-semibold text-danger">
        {{ error() }}
      </p>
    } @else if (hint()) {
      <p [id]="hintId" class="mt-1.5 text-xs text-ink-muted">{{ hint() }}</p>
    }
  `,
  host: { class: 'block' },
})
export class UiField {
  readonly label = input.required<string>();
  readonly hint = input<string>();
  readonly error = input<string>();
  readonly required = input(false);

  private readonly uid = `ui-field-${nextFieldId++}`;
  readonly controlId = `${this.uid}-control`;
  readonly hintId = `${this.uid}-hint`;
  readonly errorId = `${this.uid}-error`;

  /** The error replaces the hint when present, so only one id is ever announced. */
  readonly describedBy = computed(() =>
    this.error() ? this.errorId : this.hint() ? this.hintId : null,
  );
}
